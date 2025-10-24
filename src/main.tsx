import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { router } from './app/routes';

type RouterProviderFutureProps = React.ComponentProps<typeof RouterProvider> & {
  future?: { v7_startTransition?: boolean };
};

const RouterProviderWithFuture = RouterProvider as React.ComponentType<RouterProviderFutureProps>;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

function isLocalModeEnabled(): boolean {
  const flag = (import.meta.env?.VITE_FEATURE_LOCAL_MODE ?? 'false') as string | boolean;
  return String(flag).toLowerCase() === 'true';
}

async function enableMocking() {
  if (!isLocalModeEnabled()) {
    return;
  }

  try {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  } catch (error) {
    console.error('Failed to start the mock service worker.', error);
  }
}

function renderApp(rootElement: HTMLElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProviderWithFuture router={router} future={{ v7_startTransition: true }} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Could not find root element to mount to');
  }

  await enableMocking();
  renderApp(rootElement);
}

void bootstrap();
