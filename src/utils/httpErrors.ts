import { ko } from '@/src/i18n/ko';
import { type HttpError } from '@/src/services/http';

const STATUS_MESSAGE_MAP: Record<number, string> = {
  400: ko.common.errors.validation,
  401: ko.common.errors.unauthorized,
  403: ko.common.errors.forbidden,
  404: ko.common.errors.notFound,
  409: ko.common.errors.conflict,
  422: ko.common.errors.validation,
  429: ko.common.errors.rateLimited,
  500: ko.common.errors.server,
  502: ko.common.errors.server,
  503: ko.common.errors.server,
  504: ko.common.errors.server,
};

function isHttpError(error: unknown): error is HttpError {
  return Boolean(error && typeof error === 'object' && 'status' in (error as { status?: unknown }));
}

export function getHttpErrorMessage(error: unknown, fallback?: string): string {
  if (!error) {
    return fallback ?? ko.common.errors.default;
  }

  if (isHttpError(error)) {
    const status = typeof error.status === 'number' ? error.status : undefined;

    if (status === 0) {
      return ko.common.errors.network;
    }

    if (status && STATUS_MESSAGE_MAP[status]) {
      return STATUS_MESSAGE_MAP[status];
    }

    if (status && status >= 500) {
      return ko.common.errors.server;
    }
  }

  const message = typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message.trim()
    : '';

  if (message) {
    return message;
  }

  return fallback ?? ko.common.errors.default;
}

export type NormalizedHttpError = {
  message: string;
  status?: number;
};

export function normalizeHttpError(error: unknown, fallback?: string): NormalizedHttpError {
  if (!error) {
    return { message: fallback ?? ko.common.errors.default };
  }

  const message = getHttpErrorMessage(error, fallback);
  const status = isHttpError(error) && typeof error.status === 'number' ? error.status : undefined;

  return { message, status };
}
