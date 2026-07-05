import type { UpdateState } from '../../shared/types';

export interface UpdatePresentation {
  title: string;
  message: string;
  buttonLabel?: string;
}

export function formatUpdateBytes(bytes?: number): string | undefined {
  if (!bytes || bytes < 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1_024 && unit < units.length - 1) {
    value /= 1_024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function getUpdatePresentation(state: UpdateState): UpdatePresentation {
  const version = state.availableVersion ? ` ${state.availableVersion}` : '';
  const percent = Math.max(0, Math.min(100, state.percent ?? 0));
  const transferred = formatUpdateBytes(state.transferredBytes);
  const total = formatUpdateBytes(state.totalBytes);

  switch (state.status) {
    case 'available':
      return {
        title: `Aggiornamento${version} trovato`,
        message: 'Il download parte automaticamente in background.',
      };
    case 'downloading':
      return {
        title: `Aggiornamento${version} in download`,
        message: `${percent}%${transferred && total ? ` · ${transferred} di ${total}` : ''} · Puoi continuare a lavorare.`,
      };
    case 'downloaded':
      return {
        title: `Aggiornamento${version} pronto`,
        message: "Verrà installato al prossimo avvio, oppure puoi riavviare adesso.",
        buttonLabel: 'Riavvia e aggiorna',
      };
    case 'checking':
      return {
        title: 'Controllo aggiornamenti',
        message: 'Verifica della versione più recente in corso…',
      };
    case 'error':
      return {
        title: 'Download in pausa',
        message: 'La connessione non ha completato l’aggiornamento. Il tuo lavoro non è stato interrotto.',
        buttonLabel: 'Riprova',
      };
    default:
      return { title: '', message: '' };
  }
}
