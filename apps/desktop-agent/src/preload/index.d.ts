import type { MaxDesktopApi } from '../shared/types';

declare global {
  interface Window {
    maxDesktop: MaxDesktopApi;
  }
}

export {};
