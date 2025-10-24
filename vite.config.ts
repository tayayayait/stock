import path from 'path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_PROXY_TARGET = 'http://localhost:8787';
const PROXY_TIMEOUT_MS = 15_000;
const PROXY_MAX_RETRIES = 2;
const PROXY_RETRY_BASE_DELAY_MS = 250;

const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);
const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const normalizeBasePath = (value: string | undefined) => {
  if (!value) {
    return '';
  }

  const withLeadingSlash = ensureLeadingSlash(value);
  const trimmed = trimTrailingSlashes(withLeadingSlash);
  return trimmed === '/' ? '' : trimmed;
};

const createApiRewriter = (basePath: string) => {
  if (!basePath) {
    return (path: string) => path;
  }

  return (path: string) => {
    const withoutApiPrefix = path.replace(/^\/api/, '');
    if (!withoutApiPrefix) {
      return basePath || '/';
    }

    const normalizedSuffix = withoutApiPrefix.replace(/^\/+/, '');
    return `${basePath}${ensureLeadingSlash(normalizedSuffix)}`;
  };
};

type ProxyServerLike = {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  web: (
    req: IncomingMessage,
    res: ServerResponse,
    options: Record<string, unknown>,
    callback?: (err?: Error) => void,
  ) => void;
};

type RetriableRequest = IncomingMessage & { __proxyRetryCount?: number };

const attachProxyRetry = (proxy: unknown, options: ProxyOptions) => {
  const server = proxy as ProxyServerLike | undefined;
  if (!server || typeof server.on !== 'function' || typeof server.web !== 'function') {
    return;
  }

  const { configure: _configure, ...rest } = options;
  const retryOptions = { ...rest } as Record<string, unknown>;

  const cleanup = (req: IncomingMessage) => {
    delete (req as RetriableRequest).__proxyRetryCount;
  };

  server.on('proxyRes', (_proxyRes: unknown, req: IncomingMessage) => {
    cleanup(req);
  });

  server.on('error', (error: unknown, req: IncomingMessage, res: ServerResponse) => {
    const retriableReq = req as RetriableRequest;

    if (res.headersSent || res.writableEnded) {
      return;
    }

    const attempt = retriableReq.__proxyRetryCount ?? 0;
    if (attempt < PROXY_MAX_RETRIES) {
      const nextAttempt = attempt + 1;
      retriableReq.__proxyRetryCount = nextAttempt;
      const delay = PROXY_RETRY_BASE_DELAY_MS * 2 ** (nextAttempt - 1);

      setTimeout(() => {
        if (res.headersSent || res.writableEnded) {
          return;
        }

        server.web(req, res, retryOptions, (nextError) => {
          if (nextError) {
            // The proxy will emit another 'error' event that triggers this handler.
          }
        });
      }, delay);

      return;
    }

    cleanup(req);

    console.warn(
      `[dev-proxy] 로컬 모드 전환: API 요청 실패 (${attempt + 1}회 시도)`,
      error instanceof Error ? error.message : error,
    );

    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        message: 'API 프록시 요청에 실패했습니다.',
      }),
    );
  });
};

const createProxyOptions = (target: string, basePath: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  timeout: PROXY_TIMEOUT_MS,
  proxyTimeout: PROXY_TIMEOUT_MS,
  rewrite: createApiRewriter(basePath),
  configure: (proxy, options) => {
    attachProxyRetry(proxy, options);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const rawApiUrl = env.VITE_API_URL?.trim();

  const normalizedBasePath = normalizeBasePath(env.VITE_BASE_PATH ?? env.BASE_PATH);
  const resolvedBase = normalizedBasePath || '/';

  let proxyTarget = DEFAULT_PROXY_TARGET;
  let proxyBasePath = '';

  if (rawApiUrl) {
    try {
      const parsed = new URL(rawApiUrl);
      proxyTarget = `${parsed.protocol}//${parsed.host}`;
      proxyBasePath = normalizeBasePath(parsed.pathname);
    } catch {
      proxyTarget = rawApiUrl;
      proxyBasePath = '';
    }
  }

  return {
    base: resolvedBase,
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['.trycloudflare.com'], // ✅ Cloudflare Tunnel 도메인 허용
      proxy: {
        '/api': createProxyOptions(proxyTarget, proxyBasePath),
      },
      // HMR 안정화용 (터널 통해 연결할 때)
      hmr: {
        protocol: 'wss',
        clientPort: 443,
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
