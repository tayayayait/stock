// @ts-nocheck
import { Component, type ErrorInfo, type ReactNode } from 'react';

export type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export type ErrorBoundaryState = {
  error: Error | null;
};

const DEFAULT_TITLE = '문제가 발생했어요.';
const DEFAULT_DESCRIPTION = '예상치 못한 오류가 발생했습니다. 다시 시도해 주세요.';
const DEFAULT_RETRY_LABEL = '다시 시도';

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  private readonly handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const normalized = reason instanceof Error ? reason : new Error(String(reason ?? 'Unknown error'));
    this.setState({ error: normalized });
    if (process.env.NODE_ENV !== 'production') {
      console.error('[error-boundary] unhandled rejection captured', reason);
    }
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[error-boundary] render error', error, errorInfo);
    }
  }

  componentDidMount(): void {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render(): ReactNode {
    const { children, fallbackDescription = DEFAULT_DESCRIPTION, fallbackTitle = DEFAULT_TITLE, retryLabel = DEFAULT_RETRY_LABEL } =
      this.props;
    const { error } = this.state;

    if (error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center text-slate-700">
          <div className="max-w-md rounded-lg bg-white p-8 shadow-xl">
            <h1 className="text-xl font-semibold text-slate-900">{fallbackTitle}</h1>
            <p className="mt-3 text-sm text-slate-500">{fallbackDescription}</p>
            <button
              type="button"
              className="mt-6 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-600 focus:outline-none focus-visible:ring"
              onClick={this.handleRetry}
            >
              {retryLabel}
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
