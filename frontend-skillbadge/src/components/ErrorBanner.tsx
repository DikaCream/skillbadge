import { describeError, type AppError } from "../lib/errors";

interface ErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Human-readable network / contract failure with an optional retry action. */
export default function ErrorBanner({ error, onRetry, retrying }: ErrorBannerProps) {
  const appErr: AppError = describeError(error);

  return (
    <div className={`error-banner kind-${appErr.kind}`} role="alert">
      <div className="error-banner-title">{appErr.title}</div>
      <div className="error-banner-detail">{appErr.detail}</div>
      {onRetry && appErr.retryable && (
        <button
          className="error-banner-retry"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}