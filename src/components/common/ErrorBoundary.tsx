import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

type FallbackRenderer = (
  error: Error,
  resetErrorBoundary: () => void
) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | FallbackRenderer;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: unknown[];
}

function DefaultFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[200px] p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">Algo deu errado</h2>
        <code className="block text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 break-all">
          {error.message}
        </code>
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { resetKeys } = this.props;
    if (!this.state.hasError || !resetKeys) return;
    const prevKeys = prevProps.resetKeys ?? [];
    const changed = resetKeys.some((key, i) => key !== prevKeys[i]);
    if (changed) this.resetErrorBoundary();
  }

  resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (!hasError || !error) return children;

    if (typeof fallback === "function") {
      return (fallback as FallbackRenderer)(error, this.resetErrorBoundary);
    }

    if (fallback !== undefined) return fallback;

    return (
      <DefaultFallback error={error} onReset={this.resetErrorBoundary} />
    );
  }
}
