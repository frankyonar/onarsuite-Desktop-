import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, type ActionDefinition, type AgentMessage, type ChatMessage, type PairingInput, type PairingResponse } from '../../shared/types';
import type { AssistantActionMode } from '../../shared/types';

export class AgentSdk {
  constructor(
    private readonly getServerUrl: () => Promise<string>,
    private readonly getToken: () => Promise<string | undefined>,
  ) {}

  async pair(input: PairingInput, fingerprint: string): Promise<PairingResponse> {
    return this.request<PairingResponse>('/api/agent/devices/pair', {
      method: 'POST',
      body: JSON.stringify({
        device_name: input.deviceName,
        platform: process.platform,
        app_version: APP_VERSION,
        device_fingerprint: fingerprint,
        pairing_code: input.pairingCode || undefined,
      }),
    }, input.serverUrl, false);
  }

  async heartbeat(deviceId: string): Promise<void> {
    await this.request(`/api/agent/devices/${encodeURIComponent(deviceId)}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ status: 'online', app_version: APP_VERSION, local_time: new Date().toISOString() }),
    });
  }

  async sendEvent(payload: Record<string, unknown>): Promise<void> {
    await this.request('/api/agent/events', { method: 'POST', body: JSON.stringify(payload) });
  }

  async createAssistantAction(input: { action: string; route: string; mode: AssistantActionMode; prefill: Record<string, unknown> }): Promise<{ action_id: string; open_url: string }> {
    return this.request<{ action_id: string; open_url: string }>('/api/assistant/actions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getAssistantAction(actionId: string): Promise<{ action_id: string; action: string; route: string; mode: AssistantActionMode; status: string; prefill: Record<string, unknown>; dock_title?: string; expires_at?: string; opened_at?: string; completed_at?: string; cancelled_at?: string; message?: string }> {
    return this.request(`/api/assistant/actions/${encodeURIComponent(actionId)}`, {});
  }

  async getActionCatalog(): Promise<ActionDefinition[]> {
    const result = await this.request<ActionDefinition[] | { actions: ActionDefinition[] }>('/api/assistant/actions/catalog', {});
    return Array.isArray(result) ? result : result.actions;
  }

  async uploadArtifact(filePath: string, deviceId: string, idempotencyKey: string): Promise<unknown> {
    const bytes = await readFile(filePath);
    const body = new FormData();
    body.append('file', new Blob([bytes]), path.basename(filePath));
    body.append('device_id', deviceId);
    body.append('metadata', JSON.stringify({ source: 'desktop_upload' }));
    return this.request('/api/agent/artifacts', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } });
  }

  async createFromFile(
    kind: 'task' | 'customer-draft' | 'quote-draft',
    filePath: string,
    deviceId: string,
    extractedText: string,
    idempotencyKey: string,
  ): Promise<unknown> {
    return this.request(`/api/agent/actions/${kind}-from-file`, {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
        filename: path.basename(filePath),
        extracted_text: extractedText.slice(0, 50_000),
        idempotency_key: idempotencyKey,
      }),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  /** Run a real OnarSuite action (same catalog as the in-app Max assistant). */
  async onarExecute(actionType: string, data: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    const result = await this.request<{ success?: boolean; message?: string; error?: string; data?: unknown }>('/api/agent/actions/execute', {
      method: 'POST',
      body: JSON.stringify({ action_type: actionType, data }),
    });
    return { success: Boolean(result.success), message: result.message || result.error || 'Azione completata.', data: result.data };
  }

  /** Query the account's cloud Virtual Workspace (Hybrid bridge). Returns the
   *  raw scored rows so the cloud provider can map them into resources. */
  async workspaceSearch(query: string, limit = 8): Promise<Array<Record<string, unknown>>> {
    const q = `q=${encodeURIComponent(query)}&limit=${limit}`;
    const result = await this.request<{ results?: Array<Record<string, unknown>> }>(`/api/agent/workspace/search?${q}`, { method: 'GET' });
    return Array.isArray(result.results) ? result.results : [];
  }

  /** One tool-calling step. The server runs inference; we execute tools locally. */
  async agentStep(
    agentSystem: string,
    messages: AgentMessage[],
    tools: object[],
  ): Promise<{ message: AgentMessage; finishReason?: string }> {
    const result = await this.request<{ message: AgentMessage; finish_reason?: string }>('/api/max/desktop/agent', {
      method: 'POST',
      body: JSON.stringify({ agent_system: agentSystem, messages, tools }),
    });
    if (!result.message) throw new Error('Risposta agente non valida da OnarSuite.');
    return { message: result.message, finishReason: result.finish_reason };
  }

  async chat(deviceId: string, message: string, history: ChatMessage[], fileContext?: { filename: string; text: string }): Promise<string> {
    const result = await this.request<{ message?: string; content?: string }>('/api/max/desktop/chat', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
        message,
        history: history.slice(-20).map(({ role, content }) => ({ role, content })),
        file_context: fileContext,
      }),
    });
    const content = result.message || result.content;
    if (!content) throw new Error('Max non ha restituito una risposta valida.');
    return content;
  }

  private async request<T = unknown>(
    route: string,
    init: RequestInit,
    explicitServerUrl?: string,
    authenticated = true,
  ): Promise<T> {
    const serverUrl = normalizeServerUrl(explicitServerUrl || (await this.getServerUrl()));
    if (!serverUrl) throw new Error('URL OnarSuite non configurato.');

    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set('X-Max-Desktop-Version', APP_VERSION);
    if (authenticated) {
      const token = await this.getToken();
      if (!token) throw new Error('Token dispositivo non disponibile. Ripeti il pairing.');
      headers.set('Authorization', `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetch(`${serverUrl}${route}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new NetworkError(error instanceof Error ? error.message : 'OnarSuite non raggiungibile.');
    }

    if (response.status === 401 || response.status === 403) throw new RevokedDeviceError('Token scaduto, revocato o non autorizzato.');
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OnarSuite ha risposto ${response.status}: ${body.slice(0, 300) || response.statusText}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export class NetworkError extends Error {}
export class RevokedDeviceError extends Error {}

function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
