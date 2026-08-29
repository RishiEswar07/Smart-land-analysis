export default function Loader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate">
      <div className="w-9 h-9 rounded-full border-[3px] border-line border-t-blue animate-spin" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}
