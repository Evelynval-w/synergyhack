// client/src/components/ui/States.jsx
//
// Lightweight building blocks for polished loading/empty/error states.
// Replaces the bare "Loading..." text and the plain red banners used
// across pages. Each accepts a small icon glyph + a message + an
// optional action so pages can compose them quickly without inventing
// a new layout each time.

// Pulsing rectangle skeleton — a single rectangular placeholder with
// a soft pulse. Pages compose multiple of these to approximate the
// final layout while data is loading.
export function Skeleton({ className = '' }) {
  return (
    <div
      className={`bg-slate-200 rounded animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

// Skeleton for a card — used by TeamList, People, etc. while fetching.
export function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

// Empty state — for "no results", "no messages yet", etc.
// Distinct from error: this is a valid state, not a failure.
export function EmptyState({ icon = '◯', title, body, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
      <div className="text-3xl text-slate-300 mb-3" aria-hidden="true">
        {icon}
      </div>
      {title && (
        <h3 className="text-sm font-medium text-slate-700 mb-1">{title}</h3>
      )}
      {body && (
        <p className="text-sm text-slate-500 max-w-sm mx-auto">{body}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// Error state — for failed requests, missing resources.
// Has a destructive feel (red icon) but is contained and offers
// retry where applicable.
export function ErrorState({ title = 'Something went wrong', body, onRetry }) {
  return (
    <div className="bg-white border border-red-200 rounded-lg p-8 text-center">
      <div className="text-3xl text-red-400 mb-3" aria-hidden="true">⚠</div>
      <h3 className="text-sm font-medium text-slate-900 mb-1">{title}</h3>
      {body && <p className="text-sm text-slate-600 max-w-sm mx-auto">{body}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-sm text-emerald-700 font-medium hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
