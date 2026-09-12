import { Sparkles } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="NOVA 星流创作台">
      <span className="brand-mark"><Sparkles size={18} strokeWidth={2.4} /></span>
      {compact ? null : (
        <span className="brand-copy">
          <strong>NOVA</strong>
          <small>星流创作台</small>
        </span>
      )}
    </div>
  )
}
