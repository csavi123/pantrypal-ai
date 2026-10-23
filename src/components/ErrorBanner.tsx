import { AlertCircle, X } from "lucide-react";

export function ErrorBanner({ message, details, onDismiss }: { message: string; details?: string[] | undefined; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {details && details.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {details.map((d) => <li key={d}>{d}</li>)}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
