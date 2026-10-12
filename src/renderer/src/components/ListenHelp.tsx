import { useEffect, useRef, useState } from 'react'
import { type PlayOpts, playText } from '@/lib/audio'
import { cx } from './ui'

/** Các trang nghe phát âm chuẩn hơn (mở bằng trình duyệt mặc định). */
function webSources(text: string, kind: 'word' | 'sentence') {
  const q = encodeURIComponent(text)
  const google = { label: 'Google Dịch', hint: 'giọng đọc rõ + nghĩa', url: `https://translate.google.com/?sl=ja&tl=vi&text=${q}&op=translate` }
  if (kind === 'sentence') return [google]
  return [
    { label: 'Forvo', hint: 'người Nhật thật thu âm', url: `https://forvo.com/word/${q}/#ja` },
    { label: 'YouGlish', hint: 'video người Nhật nói từ này', url: `https://youglish.com/pronounce/${q}/japanese` },
    google
  ]
}

/**
 * Nút trợ giúp khi nghe không rõ: phát chậm (0.7×) ngay trong app,
 * hoặc mở trang web có giọng chuẩn hơn.
 */
export function ListenHelp({ text, kind = 'sentence', opts, className }: { text: string; kind?: 'word' | 'sentence'; opts?: PlayOpts; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  if (!text) return null
  const sources = webSources(text, kind)
  const btn = 'h-7 rounded-full border border-line bg-surface px-2.5 text-xs text-muted transition hover:border-ink hover:text-ink'

  return (
    <div ref={ref} className={cx('relative inline-flex items-center gap-1', className)} onClick={(e) => e.stopPropagation()}>
      <button className={btn} title="Nghe chậm (0.7×)" onClick={() => void playText(text, { ...opts, rate: 0.7 })}>
        Chậm
      </button>
      <button
        className={btn}
        title="Nghe ở web với giọng chuẩn hơn"
        onClick={() => (sources.length === 1 ? window.open(sources[0].url) : setOpen(!open))}
      >
        Web ↗
      </button>
      {open && (
        <div className="card fade-in absolute top-8 left-0 z-20 w-60 p-1 shadow-lg">
          {sources.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                window.open(s.url)
                setOpen(false)
              }}
              className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-paper"
            >
              <span className="text-sm font-medium">{s.label} ↗</span>
              <span className="text-xs text-muted">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
