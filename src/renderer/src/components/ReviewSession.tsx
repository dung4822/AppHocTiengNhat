import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { type ApiResult, call } from '@/lib/api'
import { stopAudio } from '@/lib/audio'
import { useKeys, useStudyTimer } from '@/lib/hooks'
import { IconUndo } from './icons'
import { Badge, Button, Kbd, Spinner, cx } from './ui'

export type NextResult = ApiResult<'srs.next'>
export type CardView = NonNullable<NextResult['view']>

export interface CardRenderProps {
  view: CardView
  revealed: boolean
  /** thẻ mới đang ở chế độ giới thiệu (hiện đủ thông tin ngay) */
  intro: boolean
}

const RATINGS = [
  { r: 1, key: 'again', label: 'Quên', tone: 'text-accent' },
  { r: 2, key: 'hard', label: 'Khó', tone: 'text-warn' },
  { r: 3, key: 'good', label: 'Nhớ', tone: 'text-good' },
  { r: 4, key: 'easy', label: 'Dễ', tone: 'text-indigo' }
] as const

/**
 * Phiên ôn tập kiểu Anki (dùng chung cho từ vựng & ngữ pháp).
 * Phím: Space/Enter = lật thẻ / Nhớ, 1–4 = chấm điểm, Ctrl+Z = hoàn tác.
 */
export function ReviewSession({
  deck,
  module,
  render,
  onShow,
  onReveal,
  extraKeys,
  doneExtra
}: {
  deck: 'vocab' | 'grammar'
  module: 'vocab' | 'grammar'
  render: (p: CardRenderProps) => ReactNode
  onShow?: (p: CardRenderProps) => void
  onReveal?: (view: CardView) => void
  extraKeys?: Record<string, () => void>
  doneExtra?: ReactNode
}) {
  const [res, setRes] = useState<NextResult | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [intro, setIntro] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [answered, setAnswered] = useState(0)
  const shownAt = useRef(Date.now())
  const cbs = useRef({ onShow, onReveal })
  cbs.current = { onShow, onReveal }
  useStudyTimer(module)

  const load = useCallback(async () => {
    const r = await call('srs.next', deck)
    stopAudio()
    const v = r.view
    const isIntro = !!v && v.isNew && (deck === 'grammar' || v.card.ord === 0)
    setRes(r)
    setIntro(isIntro)
    setRevealed(isIntro)
    shownAt.current = Date.now()
    if (v) {
      cbs.current.onShow?.({ view: v, revealed: isIntro, intro: isIntro })
      if (isIntro) cbs.current.onReveal?.(v)
    }
  }, [deck])

  useEffect(() => {
    void load()
    return () => stopAudio()
  }, [load])

  // Tự làm mới khi đang chờ thẻ learning tới hạn
  useEffect(() => {
    if (res && !res.view && res.nextLearnDue) {
      const ms = Math.max(1000, res.nextLearnDue - Date.now() - 20 * 60_000 + 1000)
      const t = setTimeout(load, Math.min(ms, 60_000))
      return () => clearTimeout(t)
    }
  }, [res, load])

  const reveal = () => {
    if (!res?.view || revealed) return
    setRevealed(true)
    cbs.current.onReveal?.(res.view)
  }

  const answer = async (rating: number) => {
    if (!res?.view || !revealed || busy) return
    setBusy(true)
    try {
      const out = await call('srs.answer', res.view.card.id, rating as 1 | 2 | 3 | 4, Date.now() - shownAt.current)
      if (out.leech) setToast('Thẻ này bạn quên nhiều lần (leech). Hãy đọc kỹ ghi chú / mẹo nhớ, hoặc tạm ngưng thẻ trong mục Danh sách.')
      setAnswered((a) => a + 1)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    const id = await call('srs.undo')
    if (id) {
      setAnswered((a) => Math.max(0, a - 1))
      await load()
    }
  }

  useKeys(
    {
      ' ': () => (revealed ? answer(3) : reveal()),
      Enter: () => (revealed ? answer(3) : reveal()),
      '1': () => answer(1),
      '2': () => answer(2),
      '3': () => answer(3),
      '4': () => answer(4),
      'ctrl+z': () => void undo(),
      ...(extraKeys ?? {})
    },
    [res, revealed, busy, extraKeys]
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  if (!res) return <div className="flex justify-center py-24"><Spinner /></div>

  const c = res.counts
  const view = res.view

  return (
    <div className="fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm tabular-nums">
          <span className="text-indigo" title="Thẻ mới còn lại hôm nay">Mới {c.newCount}</span>
          <span className="text-accent" title="Đang học (learning)">Học {c.learnCount}</span>
          <span className="text-good" title="Ôn tập tới hạn">Ôn {c.reviewCount}</span>
          <span className="text-muted">· đã làm {answered}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={undo} title="Hoàn tác (Ctrl+Z)">
          <IconUndo size={16} /> Hoàn tác
        </Button>
      </div>

      {view ? (
        <>
          <div key={view.card.id + ':' + view.card.reps} className="card fade-in min-h-[420px] p-8">
            <div className="mb-4 flex items-center gap-2">
              {view.isNew && <Badge tone="indigo">Mới</Badge>}
              {view.card.state === 1 && <Badge tone="accent">Đang học</Badge>}
              {view.card.state === 3 && <Badge tone="accent">Học lại</Badge>}
              {view.card.leech ? <Badge tone="warn">Leech</Badge> : null}
              {deck === 'vocab' && <Badge>{view.card.ord === 1 ? 'Thẻ nghe' : 'Thẻ đọc'}</Badge>}
            </div>
            {render({ view, revealed, intro })}
          </div>

          <div className="mt-5">
            {!revealed ? (
              <Button variant="primary" size="lg" className="w-full" onClick={reveal}>
                Hiện đáp án <Kbd>Space</Kbd>
              </Button>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {RATINGS.map((b) => (
                  <button
                    key={b.r}
                    disabled={busy}
                    onClick={() => answer(b.r)}
                    className={cx('card flex h-16 flex-col items-center justify-center transition hover:border-ink active:scale-[0.98]', b.r === 3 && 'ring-1 ring-ink/10')}
                  >
                    <span className={cx('text-sm font-semibold', b.tone)}>{b.label}</span>
                    <span className="mt-0.5 text-xs text-muted">
                      {view.intervals[b.key]} · <span className="opacity-70">{b.r}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 text-center text-xs text-muted">
              {intro ? 'Từ mới: đọc kỹ, nghe, rồi chấm "Nhớ" để bắt đầu ôn ngắt quãng.' : 'Chấm trung thực: "Quên" nếu không nhớ ra trong ~5 giây.'}
            </div>
          </div>
        </>
      ) : (
        <div className="card p-10 text-center">
          <div className="jp text-5xl">お疲れ様！</div>
          {res.nextLearnDue ? (
            <p className="mt-4 text-muted">
              Còn thẻ đang học, tới hạn lúc{' '}
              <b>{new Date(res.nextLearnDue).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</b>. Trang sẽ tự làm mới.
              Trong lúc chờ, hãy sang phần Nghe hoặc Đọc.
            </p>
          ) : (
            <p className="mt-4 text-muted">Đã xong phần ôn hôm nay. Tiếp tục nạp input để nhớ sâu hơn:</p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/listening"><Button>Luyện nghe</Button></Link>
            <Link to="/reading"><Button>Đọc bài</Button></Link>
            {doneExtra}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 max-w-sm rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm text-ink shadow-lg fade-in">{toast}</div>
      )}
    </div>
  )
}
