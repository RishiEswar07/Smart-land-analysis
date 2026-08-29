/**
 * Shared error/empty state. Explains what happened and how to fix it,
 * rather than a vague spinner-forever or blank screen.
 */
export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-danger-light text-danger flex items-center justify-center text-xl">
        !
      </div>
      <p className="text-sm text-slate max-w-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline !px-5 !py-2 !text-sm mt-1">
          Try again
        </button>
      )}
    </div>
  )
}
