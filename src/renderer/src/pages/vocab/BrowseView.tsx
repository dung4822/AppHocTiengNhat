import { useEffect, useState } from 'react'
import { IconSearch, IconX } from '@/components/icons'
import { Furigana, PitchAccent } from '@/components/jp'
import { AudioButton, Badge, Button, Card, Segmented, Spinner } from '@/components/ui'
import { type ApiResult, call } from '@/lib/api'
import { playText } from '@/lib/audio'
import { useAsync } from '@/lib/hooks'
import { ListenHelp } from '@/components/ListenHelp'

const STATUS_LABEL: Record<string, { label: string; tone: 'muted' | 'accent' | 'indigo' | 'good' | 'warn' }> = {
  new: { label: 'Chưa học', tone: 'muted' },
  learning: { label: 'Đang học', tone: 'accent' },
  review: { label: 'Đang ôn', tone: 'indigo' },
  mature: { label: 'Thuộc lâu', tone: 'good' },
  suspended: { label: 'Tạm ngưng', tone: 'warn' }
}

type Status = 'all' | 'new' | 'learning' | 'review' | 'mature' | 'suspended' | 'leech'

export function BrowseView() {
  const [q, setQ] = useState('')
  const [level, setLevel] = useState(0)
  const [status, setStatus] = useState<Status>('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const PAGE = 50
  const { data, loading, reload } = useAsync(
    () => call('vocab.browse', { q, level: level || undefined, status, offset: page * PAGE, limit: PAGE }),
    [q, level, status, page]
  )
  useEffect(() => setPage(0), [q, level, status])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <IconSearch size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm từ, cách đọc hoặc nghĩa…"
              className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-ink"
            />
          </div>
          <Segmented value={level} onChange={setLevel} items={[{ value: 0, label: 'Tất cả' }, { value: 5, label: 'N5' }, { value: 4, label: 'N4' }, { value: 3, label: 'N3' }]} />
        </div>
        <div className="mb-4">
          <Segmented
            value={status}
            onChange={setStatus}
            items={[
              { value: 'all', label: 'Tất cả' },
              { value: 'new', label: 'Chưa học' },
              { value: 'learning', label: 'Đang học' },
              { value: 'review', label: 'Đang ôn' },
              { value: 'mature', label: 'Thuộc lâu' },
              { value: 'leech', label: 'Leech' },
              { value: 'suspended', label: 'Tạm ngưng' }
            ]}
          />
        </div>
        <Card className="overflow-hidden">
          {loading && !data ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : (
            <div className="divide-y divide-line">
              {data?.rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`flex w-full items-center gap-4 px-4 py-2.5 text-left transition hover:bg-paper ${selected === r.id ? 'bg-paper' : ''}`}
                >
                  <span className="jp w-32 shrink-0 truncate text-lg">{r.word}</span>
                  <span className="jp w-32 shrink-0 truncate text-sm text-muted">{r.reading}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.vi}</span>
                  <Badge tone="indigo">N{r.level || '+'}</Badge>
                  <Badge tone={STATUS_LABEL[r.status]?.tone}>{STATUS_LABEL[r.status]?.label}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>{data?.total ?? 0} từ</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Trước</Button>
            <Button size="sm" disabled={(page + 1) * PAGE >= (data?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>Sau</Button>
          </div>
        </div>
      </div>
      <div>{selected ? <WordDetail id={selected} onClose={() => setSelected(null)} onChanged={reload} /> : <Card className="p-6 text-sm text-muted">Chọn một từ để xem chi tiết.</Card>}</div>
    </div>
  )
}

type Detail = ApiResult<'vocab.detail'>

function WordDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data, reload } = useAsync<Detail>(() => call('vocab.detail', id), [id])
  if (!data) return <Card className="p-6"><Spinner /></Card>
  const v = data.vocab
  const cards = data.cards as any[]
  const suspended = cards.every((c) => c.queue === -1)
  const act = async (fn: () => Promise<unknown>) => {
    await fn()
    await reload()
    onChanged()
  }
  return (
    <Card className="sticky top-4 p-6 fade-in">
      <div className="flex items-start justify-between">
        <Furigana segs={v.furi} className="text-4xl" />
        <button onClick={onClose} className="text-muted hover:text-ink"><IconX /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <PitchAccent reading={v.reading} accent={v.pitch?.[0]} />
        <AudioButton size="sm" onPlay={() => playText(v.reading, { accent: v.pitch?.[0] ?? null })} />
        <ListenHelp text={v.word} kind="word" opts={{ accent: v.pitch?.[0] ?? null }} />
      </div>
      <div className="mt-3 text-lg font-semibold">{v.vi}</div>
      {v.note && <div className="text-sm text-muted">{v.note}</div>}
      {v.ex && (
        <div className="mt-4 rounded-xl bg-paper p-3">
          <div className="flex items-start gap-2">
            <AudioButton size="sm" onPlay={() => playText(v.ex)} />
            <div>
              <Furigana segs={v.exFuri} className="leading-loose" />
              <div className="text-sm text-muted">{v.exVi}</div>
              <ListenHelp text={v.ex} className="mt-1" />
            </div>
          </div>
        </div>
      )}
      <div className="mt-4 space-y-1 text-sm">
        {data.kanji.map((k) => (
          <div key={k.char}>
            <span className="jp text-lg">{k.char}</span> <b className="text-accent">{k.hv}</b> <span className="text-muted">{k.vi}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1 text-xs text-muted">
        {cards.map((c) => (
          <div key={c.id}>
            {c.ord === 0 ? 'Thẻ đọc' : 'Thẻ nghe'}: {c.state === 0 ? 'chưa học' : `ôn ${c.reps} lần, quên ${c.lapses}, ổn định ${c.stability.toFixed(1)} ngày, hạn ${new Date(c.due).toLocaleDateString('vi-VN')}`}
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => act(() => call('srs.learnNow', 'vocab', v.id))}>Học ngay</Button>
        <Button size="sm" onClick={() => act(() => call('srs.setSuspended', cards.map((c) => c.id), !suspended))}>
          {suspended ? 'Bỏ tạm ngưng' : 'Tạm ngưng'}
        </Button>
        <Button size="sm" variant="danger" onClick={() => confirm('Đặt lại thẻ về trạng thái chưa học?') && act(() => call('srs.forget', cards.map((c) => c.id)))}>
          Học lại từ đầu
        </Button>
      </div>
    </Card>
  )
}
