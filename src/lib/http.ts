const API_BASE_PATH = '/api';
const MAX_RETRY_COUNT = 2;
const RETRY_BASE_DELAY_MS = 250;
const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
const DEFAULT_CLIENT_ERROR_MESSAGE = '요청을 처리할 수 없습니다. 입력값을 다시 확인해 주세요.';
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
const NETWORK_ERROR_MESSAGE = '네트워크 연결을 확인한 다음 다시 시도해 주세요.';

const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  400: '요청 형식이 올바르지 않습니다.',
  401: '로그인이 필요합니다.',
  403: '접근 권한이 없습니다.',
  404: '요청하신 정보를 찾을 수 없습니다.',
  409: '이미 처리된 요청입니다.',
  422: '입력값을 확인해 주세요.',
};

export type HttpSuccessResponse<T> = { ok: true; data: T };
export type HttpErrorResponse = { ok: false; error: { code: number | string; message: string } };
export type HttpResponse<T> = HttpSuccessResponse<T> | HttpErrorResponse;

export type HttpRequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export type RequestContext = { url: string; init: RequestInit };
export type ResponseContext = { response: Response; request: RequestContext };

export type RequestInterceptor = (context: RequestContext) => Promise<RequestContext> | RequestContext;
export type ResponseInterceptor = (context: ResponseContext) => Promise<ResponseContext> | ResponseContext;

const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];

function isLocalModeEnabled(): boolean {
  const flag = (import.meta as { env?: Record<string, unknown> }).env?.VITE_FEATURE_LOCAL_MODE;
  return String(flag).toLowerCase() === 'true';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBodyInitValue(value: unknown): value is BodyInit {
  if (value == null) {
    return false;
  }

  if (typeof value === 'string') {
    return true;
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return true;
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return true;
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return true;
  }

  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    return true;
  }

  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) {
    return true;
  }

  return false;
}

function prepareRequestInit(options: HttpRequestOptions): RequestInit {
  const { body, headers, method, ...rest } = options;
  const finalHeaders = new Headers(headers ?? {});

  if (!finalHeaders.has('accept')) {
    finalHeaders.set('accept', 'application/json, text/plain, */*');
  }

  let preparedBody: BodyInit | undefined;

  if (body !== undefined) {
    if (isBodyInitValue(body)) {
      preparedBody = body;
      if (body instanceof FormData) {
        finalHeaders.delete('content-type');
      }
    } else {
      finalHeaders.set('content-type', 'application/json');
      preparedBody = JSON.stringify(body);
    }
  }

  return {
    ...rest,
    method: method ?? 'GET',
    headers: finalHeaders,
    body: preparedBody,
  } satisfies RequestInit;
}

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith(API_BASE_PATH)) {
    return path;
  }

  if (path.startsWith('/')) {
    return `${API_BASE_PATH}${path}`;
  }

  return `${API_BASE_PATH}/${path}`;
}

function normalizeMethod(method?: string): string {
  return (method ?? 'GET').toUpperCase();
}

function computeBackoffDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** attempt;
}

async function runRequestInterceptors(initialContext: RequestContext): Promise<RequestContext> {
  let context = initialContext;
  for (const interceptor of requestInterceptors) {
    context = await interceptor(context);
  }
  return context;
}

async function runResponseInterceptors(initialContext: ResponseContext): Promise<ResponseContext> {
  let context = initialContext;
  for (const interceptor of responseInterceptors) {
    context = await interceptor(context);
  }
  return context;
}

async function readResponseBody(response: Response): Promise<{ payload: unknown; isJson: boolean } | undefined> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!contentType) {
    if (response.status === 204 || response.status === 205) {
      return undefined;
    }

    const text = await response.text();
    return text ? { payload: text, isJson: false } : undefined;
  }

  if (contentType.includes('application/json')) {
    try {
      const json = await response.json();
      return { payload: json, isJson: true };
    } catch {
      return { payload: undefined, isJson: true };
    }
  }

  const text = await response.text();
  return text ? { payload: text, isJson: false } : undefined;
}

function extractPayloadMessage(payload: unknown): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof payload === 'object') {
    if ('message' in payload && typeof (payload as { message?: unknown }).message === 'string') {
      const message = (payload as { message: string }).message.trim();
      return message ? message : undefined;
    }

    if ('error' in payload) {
      const errorValue = (payload as { error?: unknown }).error;

      if (typeof errorValue === 'string') {
        const trimmed = errorValue.trim();
        return trimmed ? trimmed : undefined;
      }

      if (errorValue && typeof errorValue === 'object' && 'message' in (errorValue as { message?: unknown })) {
        const nested = (errorValue as { message?: unknown }).message;
        if (typeof nested === 'string') {
          const trimmed = nested.trim();
          return trimmed ? trimmed : undefined;
        }
      }
    }
  }

  return undefined;
}

function normalizeSuccessPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as { data?: unknown })) {
    const dataValue = (payload as { data?: unknown }).data;
    return (dataValue ?? payload) as T;
  }

  return payload as T;
}

function createHttpErrorResponse(code: number | string, message: string): HttpErrorResponse {
  return { ok: false, error: { code, message } };
}

function buildMockLookupKey(path: string): { collection?: string; id?: string } {
  let targetPath = path;

  try {
    const url = new URL(path, 'http://localhost');
    targetPath = url.pathname;
  } catch {
    targetPath = path;
  }

  if (targetPath.startsWith(API_BASE_PATH)) {
    targetPath = targetPath.slice(API_BASE_PATH.length);
  }

  targetPath = targetPath.replace(/^\/+/, '').replace(/\/+/g, '/');

  if (!targetPath) {
    return {};
  }

  const [collection, id] = targetPath.split('/');
  return { collection: collection?.trim() || undefined, id: id?.trim() || undefined };
}

async function resolveMockResponse<T>(path: string): Promise<HttpResponse<T> | undefined> {
  const { collection, id } = buildMockLookupKey(path);
  if (!collection) {
    return undefined;
  }

  const module = await import('../mocks');

  if (!module.isMockCollectionName(collection)) {
    return undefined;
  }

  const dataset = module.getMockCollection(collection);

  if (!dataset) {
    return undefined;
  }

  if (!id) {
    return { ok: true, data: dataset as T };
  }

  if (Array.isArray(dataset)) {
    const item = dataset.find((entry) =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          'id' in (entry as { id?: unknown }) &&
          String((entry as { id: unknown }).id) === id,
      ),
    );

    if (item) {
      return { ok: true, data: item as T };
    }
  }

  return createHttpErrorResponse('MOCK_NOT_FOUND', '모의 데이터에서 항목을 찾을 수 없습니다.');
}

export function addRequestInterceptor(interceptor: RequestInterceptor): () => void {
  requestInterceptors.push(interceptor);
  return () => {
    const index = requestInterceptors.indexOf(interceptor);
    if (index >= 0) {
      requestInterceptors.splice(index, 1);
    }
  };
}

export function addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
  responseInterceptors.push(interceptor);
  return () => {
    const index = responseInterceptors.indexOf(interceptor);
    if (index >= 0) {
      responseInterceptors.splice(index, 1);
    }
  };
}

export async function httpRequest<T>(path: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
  const initialContext: RequestContext = {
    url: resolveUrl(path),
    init: prepareRequestInit(options),
  };

  const context = await runRequestInterceptors(initialContext);
  const method = normalizeMethod(context.init.method);

  let attempt = 0;

  while (attempt <= MAX_RETRY_COUNT) {
    try {
      const response = await fetch(context.url, context.init);
      const intercepted = await runResponseInterceptors({ response, request: context });
      const finalResponse = intercepted.response;
      const status = finalResponse.status;

      if (status >= 500 && attempt < MAX_RETRY_COUNT) {
        await delay(computeBackoffDelay(attempt));
        attempt += 1;
        continue;
      }

      const body = await readResponseBody(finalResponse);

      if (status >= 200 && status < 300) {
        const data = normalizeSuccessPayload<T>(body?.payload);
        return { ok: true, data };
      }

      if (status >= 400 && status < 500) {
        const messageFromBody = extractPayloadMessage(body?.payload);
        const message = messageFromBody ?? CLIENT_ERROR_MESSAGES[status] ?? DEFAULT_CLIENT_ERROR_MESSAGE;
        return createHttpErrorResponse(status, message);
      }

      const messageFromBody = extractPayloadMessage(body?.payload);
      const message = messageFromBody ?? SERVER_ERROR_MESSAGE;
      return createHttpErrorResponse(status, message);
    } catch (error) {
      if (isLocalModeEnabled() && method === 'GET') {
        const mockResponse = await resolveMockResponse<T>(path);
        if (mockResponse) {
          return mockResponse;
        }
      }

      if (attempt < MAX_RETRY_COUNT) {
        await delay(computeBackoffDelay(attempt));
        attempt += 1;
        continue;
      }

      return createHttpErrorResponse(NETWORK_ERROR_CODE, NETWORK_ERROR_MESSAGE);
    }
  }

  return createHttpErrorResponse('UNHANDLED', SERVER_ERROR_MESSAGE);
}

export const http = {
  request: httpRequest,
};

export default http;
