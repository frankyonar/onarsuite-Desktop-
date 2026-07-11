# Publishes Max Desktop to GitHub Releases.
# Reads the GitHub token from Git's credential store (stays local), creates the
# release, and uploads the NSIS installer. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\franc\Documents\Max Desktop\publish-release.ps1"

$ErrorActionPreference = 'Stop'
$null = Add-Type -AssemblyName System.Net.Http
$repo    = 'frankyonar/onarsuite-Desktop-'
$repoApi = 'https://api.github.com/repos/frankyonar/onarsuite-Desktop-'
$appPkg  = Get-Content 'C:\Users\franc\Documents\Max Desktop\apps\desktop-agent\package.json' -Raw | ConvertFrom-Json
$tag     = "v$($appPkg.version)"
$assetDir = 'C:\Users\franc\Documents\Max Desktop\apps\desktop-agent\release'
$latest   = Join-Path $assetDir 'latest.yml'

if (-not (Test-Path $latest)) { throw "Metadati update non trovati: $latest" }
$latestText = Get-Content $latest -Raw
$assetMatch = [regex]::Match($latestText, '^path:\s*(.+)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
if (-not $assetMatch.Success) { throw "latest.yml non contiene il nome dell'installer." }
$assetName = $assetMatch.Groups[1].Value.Trim()
if (-not $assetName) { throw "latest.yml non contiene il nome dell'installer." }
$assetFile = Join-Path $assetDir "OnarSuite Setup $($appPkg.version).exe"
$asset = (Get-Item $assetFile).FullName
$blockmap = "$asset.blockmap"

if (-not (Test-Path $asset)) { throw "Installer non trovato: $asset" }
if (-not (Test-Path $blockmap)) { throw "Blockmap non trovato: $blockmap" }

# --- token from git credential store (not printed, not persisted) ---
# PowerShell can't redirect stdin into a native exe, so feed the (non-secret)
# query to git via cmd.exe, which supports `<`.
$q = Join-Path $env:TEMP 'gcred-query.txt'
"protocol=https`nhost=github.com`n" | Out-File -FilePath $q -Encoding ascii
$cred = cmd /c "git credential fill < `"$q`""
Remove-Item $q -Force -ErrorAction SilentlyContinue
$line  = $cred | Select-String '^password='
if (-not $line) { throw "Token GitHub non trovato nel credential store. Esegui prima un 'git push' per salvare le credenziali." }
$token = $line.ToString().Substring(9)

# --- release body to a file (avoids JSON newline-escaping issues) ---
$bodyText = @"
OnarSuite $($appPkg.version)

- Corretto il layout del pannello destro Magic Panel: intestazione, tab e contenuto restano ancorati in alto nel giusto ordine.
- Lo stato vuoto Output ora resta visibile e centrato invece di lasciare il pannello apparentemente vuoto.
- Stabilizzato il layout del dock con una griglia dedicata, mantenendo la rail compatta invariata.

Nota: per ridurre davvero i falsi positivi di SmartScreen/antivirus, firma il
binario Windows con un certificato di code signing prima della distribuzione
pubblica.
"@
$payload = @{ tag_name = $tag; name = "OnarSuite $($appPkg.version)"; body = $bodyText; draft = $false; prerelease = $false } | ConvertTo-Json
$payloadFile = Join-Path $env:TEMP 'maxdesktop-release.json'
[System.IO.File]::WriteAllText($payloadFile, $payload, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Creo la release $tag ..."
$createOut = & curl.exe --ssl-no-revoke -s -X POST `
  -H "Authorization: token $token" `
  -H "Accept: application/vnd.github+json" `
  -H "Content-Type: application/json" `
  --data "@$payloadFile" `
  "$repoApi/releases"

$release = $createOut | ConvertFrom-Json
if (-not $release.id) {
  Write-Host "La release potrebbe esistere già, provo a recuperarla per tag..."
  $releaseOut = & curl.exe --ssl-no-revoke -s `
    -H "Authorization: token $token" `
    -H "Accept: application/vnd.github+json" `
    "$repoApi/releases/tags/$tag"
  $release = $releaseOut | ConvertFrom-Json
}
if (-not $release.id) { Write-Host $createOut; throw "Creazione release fallita." }
Write-Host "Release creata: $($release.html_url)"

function Invoke-GitHubApi([string]$method, [string]$url) {
  return & curl.exe --ssl-no-revoke -s -X $method `
    -H "Authorization: token $token" `
    -H "Accept: application/vnd.github+json" `
    $url
}

function Remove-ReleaseAssetByName([int]$releaseId, [string]$assetName) {
  $assetsOut = Invoke-GitHubApi 'GET' "$repoApi/releases/$releaseId/assets?per_page=100"
  $assets = @()
  try { $assets = $assetsOut | ConvertFrom-Json } catch { return }
  foreach ($asset in $assets | Where-Object { $_.name -eq $assetName }) {
    Write-Host "Rimuovo asset esistente $($asset.name)..."
    $null = Invoke-GitHubApi 'DELETE' "$repoApi/releases/assets/$($asset.id)"
  }
}

$uploadBases = @()
if ($release.upload_url) {
  $uploadBases += ($release.upload_url -replace '\{\?name,label\}$', '')
}
$uploadBases += "https://uploads.github.com/repos/frankyonar/onarsuite-Desktop-/releases/$($release.id)/assets"

function Invoke-ReleaseUpload([string]$baseUrl, [string]$name, [string]$path) {
  $encodedName = [uri]::EscapeDataString($name)
  $url = "$baseUrl?name=$encodedName"
  $uploadPath = $path
  if ($path -match '\s') {
    $uploadPath = Join-Path $env:TEMP ([System.IO.Path]::GetFileName($path) -replace '\s+', '_')
    Copy-Item -LiteralPath $path -Destination $uploadPath -Force
  }
  try {
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.BaseAddress = [uri]$baseUrl
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "?name=$encodedName")
    $request.Headers.TryAddWithoutValidation('Authorization', "token $token") | Out-Null
    $stream = [System.IO.File]::OpenRead($uploadPath)
    try {
      $content = [System.Net.Http.StreamContent]::new($stream)
      $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/octet-stream')
      $request.Content = $content
      $response = $client.SendAsync($request).GetAwaiter().GetResult()
      $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      return [pscustomobject]@{ Body = $body; Code = [int]$response.StatusCode; ExitCode = 0; Url = $url }
    } finally {
      $stream.Dispose()
      $client.Dispose()
      $handler.Dispose()
    }
  } catch {
    $response = $_.Exception.Response
    $code = 0
    $body = ''
    $errorText = $_.Exception.Message
    if ($response) {
      try { $code = [int]$response.StatusCode } catch {}
      try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $body = $reader.ReadToEnd()
      } catch {}
    }
    return [pscustomobject]@{ Body = $body; Code = $code; ExitCode = 1; Error = $errorText; Url = $url }
  }
}

Write-Host "Carico l'installer (109 MB)..."
$uploaded = $null
$uploadOut = $null
foreach ($base in $uploadBases) {
  Remove-ReleaseAssetByName $release.id $assetName
  $uploadOut = Invoke-ReleaseUpload $base $assetName $asset
  if ($uploadOut.Code -in 200,201) {
    $uploaded = $uploadOut.Body | ConvertFrom-Json
    if ($uploaded.browser_download_url) { break }
  } else {
    Write-Host "Upload attempt failed (http=$($uploadOut.Code), exit=$($uploadOut.ExitCode)) via $base"
    if ($uploadOut.Error) { Write-Host $uploadOut.Error }
  }
}
if (-not $uploaded.browser_download_url) { Write-Host $uploadOut.Body; throw "Upload asset fallito." }

$assets = @(
  @{ path = $blockmap; name = "$assetName.blockmap" },
  @{ path = $latest; name = [System.IO.Path]::GetFileName($latest) }
)
foreach ($item in $assets) {
    Write-Host "Carico $($item.name)..."
    $result = $null
    $json = $null
    foreach ($base in $uploadBases) {
    Remove-ReleaseAssetByName $release.id $item.name
    $result = Invoke-ReleaseUpload $base $item.name $item.path
    if ($result.Code -in 200,201) {
      $json = $result.Body | ConvertFrom-Json
      if ($json.browser_download_url) { break }
    } else {
      Write-Host "Upload attempt failed (http=$($result.Code), exit=$($result.ExitCode)) via $base"
      if ($result.Error) { Write-Host $result.Error }
    }
  }
  if (-not $json.browser_download_url) { Write-Host $result.Body; throw "Upload asset fallito per $($item.name)." }
}

Write-Host "`nFATTO. Download:`n$($uploaded.browser_download_url)"
Remove-Item $payloadFile -ErrorAction SilentlyContinue
