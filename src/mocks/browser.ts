import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

let startPromise: Promise<void> | null = null;

export function startMockWorker(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (!startPromise) {
    startPromise = worker.start({ onUnhandledRequest: 'bypass' }).then(() => undefined);
  }

  return startPromise;
}
