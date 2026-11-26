import type { AstaBridgeApi } from '../shared/ipc';

declare global {
  interface Window {
    asta: AstaBridgeApi;
  }
}

export {};
