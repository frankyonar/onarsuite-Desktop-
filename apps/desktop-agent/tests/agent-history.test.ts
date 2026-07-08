import { describe, expect, it } from 'vitest';
import { AgentEngine } from '../src/main/services/agent-engine';

describe('Agent conversation history', () => {
  it('merges Magic Panel results without discarding existing context', () => {
    const engine = new AgentEngine(null as never, null as never, null as never);
    engine.recordExchange('Crea un cliente', 'Compila e conferma la scheda.');
    engine.mergePlainHistory([
      { id: '1', role: 'user', content: 'Crea un cliente', createdAt: '2026-07-08T00:00:00.000Z' },
      { id: '2', role: 'assistant', content: 'Compila e conferma la scheda.', createdAt: '2026-07-08T00:00:01.000Z' },
      { id: '3', role: 'assistant', content: 'Anagrafica Mario Rossi creata con successo.', createdAt: '2026-07-08T00:00:02.000Z' },
    ]);

    expect(engine.getMessages()).toEqual([
      { role: 'user', content: 'Crea un cliente' },
      { role: 'assistant', content: 'Compila e conferma la scheda.' },
      { role: 'assistant', content: 'Anagrafica Mario Rossi creata con successo.' },
    ]);
  });
});
