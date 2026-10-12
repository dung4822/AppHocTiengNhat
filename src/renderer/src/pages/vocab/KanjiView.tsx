import { useState } from 'react'
import { IconX } from '@/components/icons'
import { Badge, Card, Segmented, Spinner, cx } from '@/components/ui'
import { call } from '@/lib/api'
import { useAsync } from '@/lib/hooks'

/** Bảng kanji theo cấp độ, kèm âm Hán Việt — mở một chữ để xem các từ chứa nó. */
export function KanjiView() {
  const [level, setLevel] = useState(5)
  const [sel, setSel] = useState<string | null>(null)
  const { data, loading } = useAsync(() => call('kanji.list', level), [level])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <Segmented value={level} onChange={setLevel} items={[{ value: 5, label: 'N5' }, { value: 4, label: 'N4' }, { value: 3, label: 'N3' }]} />
          <span className="text-sm text-muted">
            {data ? `${data.filter((k) => k.known > 0).length}/${data.length} chữ đã gặp trong từ đã thuộc` : ''}
          </span>
        </div>
        {loading && !data ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
            {data?.map((k) => (
              <button
                key={k.char}
                onClick={() => setSel(k.char)}
                className={cx(
                  'card flex flex-col items-center py-2 transition hover:border-ink',
                  k.known > 0 ? '' : 'opacity-60',
                  sel === k.char && 'border-ink'
                )}
              >
                <span className="jp text-3xl">{k.char}</span>
                <span className="mt-1 max-w-full truncate px-1 text-[10px] font-semibold tracking-wide text-accent">{k.hv}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>{sel ? <KanjiDetail char={sel} onClose={() => setSel(null)} /> : <Card className="p-6 text-sm text-muted">Chữ mờ = chưa xuất hiện trong từ bạn đã thuộc.</Card>}</div>
    </div>
  )
}

function KanjiDetail({ char, onClose }: { char: string; onClose: () => void }) {
  const { data } = useAsync(() => call('kanji.detail', char), [char])
  if (!data) return <Card className="p-6"><Spinner /></Card>
  const k = data.kanji
  return (
    <Card className="sticky top-4 p-6 fade-in">
      <div className="flex items-start justify-between">
        <div className="jp text-7xl leading-none">{char}</div>
        <button onClick={onClose} className="text-muted hover:text-ink"><IconX /></button>
      </div>
      <div className="mt-3 text-xl font-semibold tracking-wide text-accent">{k?.hv}</div>
      <div className="text-sm">{k?.vi}</div>
      {k?.mn && <div className="mt-2 rounded-lg bg-paper p-2 text-sm text-muted">{k.mn}</div>}
      <div className="jp mt-3 space-y-1 text-sm">
        <div><span className="text-xs text-muted">音 </span>{k?.on.join('、') || '—'}</div>
        <div><span className="text-xs text-muted">訓 </span>{k?.kun.join('、') || '—'}</div>
        <div className="text-xs text-muted">{k?.strokes} nét · {k?.en.slice(0, 3).join(', ')}</div>
      </div>
      <div className="mt-4 text-xs font-medium text-muted uppercase">Từ chứa chữ này</div>
      <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {(data.words as any[]).map((w) => (
          <div key={w.id} className="flex items-center gap-2 text-sm">
            <span className="jp w-20 shrink-0">{w.word}</span>
            <span className="jp w-24 shrink-0 text-xs text-muted">{w.reading}</span>
            <span className="min-w-0 flex-1 truncate">{w.vi}</span>
            {w.state === 2 ? <Badge tone="good">thuộc</Badge> : w.state ? <Badge tone="accent">học</Badge> : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
