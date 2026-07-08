export type LocalFilePathSegment = string | { kind: 'local-file-path'; path: string };

const WINDOWS_LOCAL_FILE_PATH = /\b[A-Za-z]:\\(?:[^<>:"|?*\r\n]+\\)*[^<>:"|?*\r\n]+?\.[A-Za-z0-9]{1,12}(?=$|[\s)\]}>,;:!?'"]|[—–-]\s)/g;

export function splitLocalFilePathSegments(text: string): LocalFilePathSegment[] {
  const segments: LocalFilePathSegment[] = [];
  const matcher = new RegExp(WINDOWS_LOCAL_FILE_PATH);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text))) {
    if (match.index > lastIndex) segments.push(text.slice(lastIndex, match.index));
    segments.push({ kind: 'local-file-path', path: match[0] });
    lastIndex = matcher.lastIndex;
  }

  if (lastIndex < text.length) segments.push(text.slice(lastIndex));
  return segments.length ? segments : [text];
}
