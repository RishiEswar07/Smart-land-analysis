/**
 * Consistent labeled input/select used across the Land Analysis form.
 * Pass `as="select"` with `children` for dropdowns.
 * Pass `readOnly` for auto-computed fields (e.g. area/address derived
 * from the drawn boundary) — renders with muted styling so it's visually
 * clear the value isn't meant to be typed into.
 */
export default function FormField({ label, as = 'input', children, className = '', readOnly = false, ...props }) {
  const Tag = as
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-slate mb-1.5">{label}</span>
      <Tag
        readOnly={readOnly}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors ${
          readOnly
            ? 'border-line bg-mist text-slate cursor-not-allowed'
            : 'border-line bg-white text-ink focus:border-blue'
        }`}
        {...props}
      >
        {children}
      </Tag>
    </label>
  )
}
