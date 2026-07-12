import { describe, expect, it, vi } from 'vitest';
import { isReadOnlyTool } from '../src/main/services/agent-engine';
import { AgentTools } from '../src/main/services/tools';

describe('business brief and operating modes', () => {
  it('collects the company snapshot from independent read sources', async () => {
    const onarExecute = vi.fn(async (action: string) => ({
      success: action !== 'stripe_balance',
      message: action === 'stripe_balance' ? 'Stripe non collegato' : `${action} disponibile`,
      data: action === 'list_reminders' ? { reminders: [{ id: 1 }, { id: 2 }] } : { items: [{ id: 1 }] },
    }));
    const tools = new AgentTools(
      {} as never,
      { write: vi.fn(async () => undefined) } as never,
      vi.fn() as never,
      onarExecute,
      vi.fn() as never,
      vi.fn() as never,
    );

    const result = await tools.execute('business_brief', { horizon_days: 90, focus: 'vendite' });
    const data = result.data as { horizonDays: number; sections: Array<{ key: string; count?: number }> };

    expect(result.ok).toBe(true);
    expect(data.horizonDays).toBe(30);
    expect(data.sections).toHaveLength(6);
    expect(data.sections.find((section) => section.key === 'reminders')?.count).toBe(2);
    expect(onarExecute).toHaveBeenCalledTimes(6);
  });

  it('allows reads and blocks writes in plan and audit modes', () => {
    expect(isReadOnlyTool('business_brief', {})).toBe(true);
    expect(isReadOnlyTool('onar_action', { action_type: 'contract_search' })).toBe(true);
    expect(isReadOnlyTool('onar_action', { action_type: 'create_contract' })).toBe(false);
    expect(isReadOnlyTool('write_file', {})).toBe(false);
    expect(isReadOnlyTool('run_shell', {})).toBe(false);
  });
});
