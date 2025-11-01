const BASE = '/api';
const DEFAULT_ERROR_MESSAGE = '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
const INVALID_CONTENT_MESSAGE = '서버에서 예상치 못한 형식의 응답을 보냈어요.';

const SANITIZE_BLACKLIST = new Set([
  'ok',
  'okay',
  'success',
  'request failed',
  'failed to fetch',
  'network error',
  'networkerror when attempting to fetch resource.',
  'internal server error',
  'bad request',
  'forbidden',
  'unauthorized',
]);

const TIMEOUT_ERROR_MESSAGE = '요청 시간이 초과되었습니다. 다시 시도해 주세요.';

export type RequestOptions = Omit<RequestInit, 'method' | 'body' | 'headers' | 'signal'> & {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type HttpError = Error & { status?: number; payload?: unknown };

function isBodyInit(value: unknown): value is BodyInit {
  if (value == null) {
    return false;
  }

  return (
    typeof value === 'string' ||
    (typeof FormData !== 'undefined' && value instanceof FormData) ||
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) ||
    (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  );
}

function buildHeaders(headers: HeadersInit = {}, hasBody: boolean): Headers {
  const finalHeaders = new Headers(headers);
  if (hasBody && !finalHeaders.has('content-type')) {
    finalHeaders.set('content-type', 'application/json');
  }
  return finalHeaders;
}

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith(BASE)) {
    return path;
  }

  if (path.startsWith('/')) {
    return `${BASE}${path}`;
  }

  return `${BASE}/${path}`;
}

function isLikelyHtml(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (!trimmed.startsWith('<')) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  return (
    normalized.startsWith('<!doctype') ||
    normalized.startsWith('<html') ||
    /^<\w[\w-]*[\s>]/.test(normalized)
  );
}

function sanitizeMessage(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || isLikelyHtml(trimmed)) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (SANITIZE_BLACKLIST.has(normalized)) {
    return undefined;
  }

  return trimmed;
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    return sanitizeMessage(payload);
  }

  if (typeof payload === 'object') {
    if ('message' in payload && typeof (payload as { message?: unknown }).message === 'string') {
      return sanitizeMessage((payload as { message: string }).message);
    }

    if ('error' in payload) {
      const error = (payload as { error?: unknown }).error;
      if (typeof error === 'string' && error.trim()) {
        return sanitizeMessage(error);
      }

      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
          return sanitizeMessage(message);
        }
      }
    }
  }

  return undefined;
}

function isFailurePayload(payload: unknown): payload is { success: false; error?: unknown } {
  return Boolean(payload && typeof payload === 'object' && 'success' in (payload as Record<string, unknown>) && !(payload as { success?: unknown }).success);
}

async function parsePayload(
  response: Response,
  expectsJson: boolean,
): Promise<{ payload: unknown; rawText?: string }> {
  if (!expectsJson) {
    const text = await response.text();
    return { payload: text, rawText: text };
  }

  try {
    const json = await response.clone().json();
    return { payload: json };
  } catch {
    const text = await response.text();

    if (!text) {
      return { payload: undefined, rawText: '' };
    }

    try {
      return { payload: JSON.parse(text), rawText: text };
    } catch {
      return {
        payload: {
          success: false,
          error: {
            code: response.status,
            message: sanitizeMessage(text) ?? DEFAULT_ERROR_MESSAGE,
          },
        },
        rawText: text,
      };
    }
  }
}

function prepareBody(body: unknown, headers: Headers): BodyInit {
  if (isBodyInit(body)) {
    if (body instanceof FormData) {
      headers.delete('content-type');
    }

    return body;
  }

  if (body === undefined) {
    return '';
  }

  return JSON.stringify(body);
}

function createHttpError(message: string, status: number, payload: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.name = 'HttpError';
  error.status = status;
  error.payload = payload;
  return error;
}

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    idempotencyKey,
    signal,
    timeoutMs,
    ...rest
  } = options;

  const hasBody = body !== undefined;
  const finalHeaders = buildHeaders(headers, hasBody);

  if (body instanceof FormData && finalHeaders.has('content-type')) {
    finalHeaders.delete('content-type');
  }

  if (idempotencyKey) {
    finalHeaders.set('idempotency-key', idempotencyKey);
  }

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  let abortedByTimeout = false;

  const abortWithReason = (reason?: unknown) => {
    if (controller.signal.aborted) {
      return;
    }

    if (reason !== undefined) {
      try {
        controller.abort(reason);
        return;
      } catch {
        // Older environments may not support abort reasons; fall back to abort without one.
      }
    }

    controller.abort();
  };

  if (signal) {
    const extractReason = () => (signal as AbortSignal & { reason?: unknown }).reason;
    if (signal.aborted) {
      abortWithReason(extractReason());
    } else {
      abortListener = () => {
        abortWithReason(extractReason());
      };
      signal.addEventListener('abort', abortListener);
    }
  }

  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      abortedByTimeout = true;
      abortWithReason();
    }, timeoutMs);
  }

  const cleanupAbortEffects = () => {
    if (abortListener && signal) {
      signal.removeEventListener('abort', abortListener);
      abortListener = null;
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const init: RequestInit = {
    ...rest,
    method,
    headers: finalHeaders,
    signal: controller.signal,
  };

  if (hasBody) {
    init.body = prepareBody(body, finalHeaders);
  }

  let response: Response;
  try {
    response = await fetch(resolveUrl(path), init);
  } catch (error) {
    cleanupAbortEffects();
    const errorName = (error as { name?: string })?.name;
    const isAbortError =
      (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
      errorName === 'AbortError';
    if (isAbortError) {
      const message = abortedByTimeout ? TIMEOUT_ERROR_MESSAGE : DEFAULT_ERROR_MESSAGE;
      const abortError = createHttpError(message, 0, undefined);
      (abortError as Error & { cause?: unknown }).cause = error;
      throw abortError;
    }
    const networkError = createHttpError(DEFAULT_ERROR_MESSAGE, 0, undefined);
    (networkError as Error & { cause?: unknown }).cause = error;
    throw networkError;
  }

  cleanupAbortEffects();

  const status = response.status;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const expectsJson = contentType.includes('application/json');

  if (status === 204 || status === 205) {
    if (!response.ok) {
      const statusLabel = response.statusText?.trim() ? `${status} ${response.statusText}` : `${status}`;
      throw createHttpError(`${DEFAULT_ERROR_MESSAGE} (HTTP ${statusLabel})`, status, undefined);
    }

    return undefined as T;
  }

  const { payload, rawText } = await parsePayload(response, expectsJson);

  if (response.ok) {
    if (!expectsJson) {
      if (rawText && rawText.trim()) {
        throw createHttpError(INVALID_CONTENT_MESSAGE, status, rawText);
      }

      return undefined as T;
    }

    if (isFailurePayload(payload)) {
      const statusFromPayload =
        typeof (payload as { error?: { code?: unknown } }).error === 'object'
          ? ((payload as { error: { code?: unknown } }).error.code as number | undefined)
          : undefined;

      const message = extractErrorMessage(payload) ?? DEFAULT_ERROR_MESSAGE;
      throw createHttpError(message, statusFromPayload ?? status, payload);
    }

    if (payload === undefined) {
      return undefined as T;
    }

    const data =
      typeof payload === 'object' && payload !== null && 'data' in (payload as { data?: unknown })
        ? ((payload as { data?: unknown }).data ?? payload)
        : payload;

    return data as T;
  }

  const messageSource = payload ?? rawText;
  const extractedMessage = extractErrorMessage(messageSource) ?? DEFAULT_ERROR_MESSAGE;
  const statusLabel = response.statusText?.trim() ? `${status} ${response.statusText}` : `${status}`;
  const message =
    extractedMessage && extractedMessage !== DEFAULT_ERROR_MESSAGE
      ? extractedMessage
      : `${DEFAULT_ERROR_MESSAGE} (HTTP ${statusLabel})`;

  throw createHttpError(message, status, payload ?? rawText);
}

export function get<T = unknown>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
  return request<T>(path, { ...options, method: 'GET' });
}

export function post<T = unknown>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
  return request<T>(path, { ...options, method: 'POST', body });
}

export function patch<T = unknown>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
  return request<T>(path, { ...options, method: 'PATCH', body });
}

export function del<T = unknown>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
  return request<T>(path, { ...options, method: 'DELETE' });
}

export const __test__ = {
  extractErrorMessage,
  sanitizeMessage,
  isLikelyHtml,
  parsePayload,
};

export const http = {
  request,
  get,
  post,
  patch,
  delete: del,
};

export default http;
