import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { type ATok, type FuriMode, type Passage, type Sent, TokenSentence, WordPanel } from '@/components/TokenText'
import { IconChevronLeft, IconMic, IconPause, IconPlay, IconRepeat } from '@/components/icons'
import { Badge, Button, Card, Segmented, Spinner, Toggle, cx } from '@/components/ui'
import { call } from '@/lib/api'
import { getRate, playSequence, playText, resolveAudio, mediaUrl, setRate, stopAudio } from '@/lib/audio'
import { useAsync, useKeys, useStudyTimer } from '@/lib/hooks'
import { QuestionsBlock } from '../reading/QuestionsBlock'

/** Trình phát bài nghe: nghe cả bài / từng câu, ẩn-hiện lời, dịch, shadowing có ghi âm. */
export function ListeningPlayer() {
  const { id } = useParams()
  const { data, reload } = useAsync(() => call('passage.get', Number(id)), [id])
  if (!data) return <div className="flex justify-center py-20"><Spinner /></div>
  return <PlayerInner p={data as Passage} reload={reload} />
}

function PlayerInner({ p, reload }: { p: Passage; reload: () => void }) {
  const nav = useNavigate()
  const [cur, setCur] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [showText, setShowText] = useState(false)
  const [showVi, setShowVi] = useState(false)
  const [furi, setFuri] = useState<FuriMode>('unknown')
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [rate, setRateState] = useState(getRate())
  const [pick, setPick] = useState<{ tok: ATok; sent: Sent } | null>(null)
  const [listens, setListens] = useState(0)
  useStudyTimer('listening')

  useEffect(() => () => stopAudio(), [])

  const playAll = async (from = 0) => {
    setPlaying(true)
    await playSequence(
      p.sentences.slice(from).map((s) => ({ text: s.jp, opts: { role: s.sp ?? 'A' }, gapMs: 450 })),
      (i) => setCur(i < 0 ? -1 : i + from)
    )
    setPlaying(false)
    setCur(-1)
    if (from === 0) setListens((n) => n + 1)
  }
  const stop = () => {
    stopAudio()
    setPlaying(false)
    setCur(-1)
  }
  const playLine = async (i: number) => {
    stopAudio()
    setCur(i)
    await playText(p.sentences[i].jp, { role: p.sentences[i].sp ?? 'A' })
    setCur(-1)
  }

  useKeys({ ' ': () => (playing ? stop() : void playAll()) }, [playing, p])

  return (
    <div className="fade-in">
      <button onClick={() => { stop(); nav('/listening') }} className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-ink">
        <IconChevronLeft size={16} /> Danh sách bài nghe
      </button>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="indigo">N{p.level}</Badge>
            <span className="text-sm text-muted">{p.titleVi}</span>
          </div>
          <h1 className={cx('jp mt-1 text-2xl font-semibold transition', !showText && 'blur-sm select-none')}>{p.title}</h1>
        </div>
        <div className="text-right text-xs text-muted">
          Độ phủ từ đã biết: <b className="text-ink">{Math.round(p.coverage * 100)}%</b>
          <br />
          Đã nghe hết bài: {listens} lần trong phiên
        </div>
      </div>

      {/* Thanh điều khiển */}
      <Card className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 p-3">
        <Button variant="primary" onClick={() => (playing ? stop() : playAll())}>
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />} {playing ? 'Dừng' : 'Nghe cả bài'}
        </Button>
        <Segmented
          value={rate}
          onChange={(r) => {
            setRate(r)
            setRateState(r)
          }}
          items={[0.75, 0.9, 1, 1.15].map((r) => ({ value: r, label: `${r}×` }))}
        />
        <div className="mx-2 h-6 w-px bg-line" />
        <Toggle checked={showText} onChange={setShowText} label="Hiện lời" />
        <Toggle checked={showVi} onChange={setShowVi} label="Dịch" />
        {showText && (
          <Segmented value={furi} onChange={setFuri} items={[{ value: 'all', label: 'Furigana: tất cả' }, { value: 'unknown', label: 'từ chưa thuộc' }, { value: 'none', label: 'không' }]} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-2">
          {p.sentences.map((s, i) => {
            const visible = showText || revealed.has(i)
            return (
              <div
                key={i}
                className={cx('card flex items-start gap-3 p-3 transition', cur === i && 'border-indigo ring-2 ring-indigo/20')}
              >
                <span className={cx('mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.sp === 'B' ? 'bg-indigo-soft text-indigo' : 'bg-accent-soft text-accent')}>
                  {s.sp ?? 'A'}
                </span>
                <div className="min-w-0 flex-1">
                  {visible ? (
                    <div className="text-xl">
                      <TokenSentence sent={s} furi={furi} onPick={(tok, sent) => setPick({ tok, sent })} />
                    </div>
                  ) : (
                    <button
                      onClick={() => setRevealed(new Set(revealed).add(i))}
                      className="h-9 w-full rounded-lg bg-line/60 text-left text-xs text-muted hover:bg-line"
                    >
                      <span className="px-3">Bấm để hiện câu này</span>
                    </button>
                  )}
                  {showVi && <div className="mt-1 text-sm text-muted">{s.vi}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button title="Nghe câu này" onClick={() => playLine(i)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-paper hover:text-ink">
                    <IconRepeat size={15} />
                  </button>
                  <Shadow text={s.jp} role={s.sp ?? 'A'} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="space-y-4">
          {pick ? (
            <WordPanel tok={pick.tok} sent={pick.sent} onClose={() => setPick(null)} onAdded={reload} />
          ) : (
            <Card className="p-4 text-sm text-muted">
              <div className="mb-2 font-medium text-ink">Gợi ý</div>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Nghe cả bài 2 lần, chưa xem lời.</li>
                <li>Trả lời câu hỏi bên dưới.</li>
                <li>Bật “Hiện lời” + “Dịch” để kiểm tra.</li>
                <li>Shadowing: bấm 🎤 từng câu, nói đuổi theo rồi nghe lại giọng mình.</li>
              </ol>
              <div className="mt-3 text-xs">Từ gạch chấm đỏ = chưa có trong kho; xanh = sắp học; nền vàng = đang học. Bấm để tra.</div>
            </Card>
          )}
        </div>
      </div>

      <QuestionsBlock passage={p} onDone={() => call('passage.done', p.id)} />
    </div>
  )
}

/** Shadowing: phát câu mẫu, ghi âm người học trong khoảng thời gian tương ứng, rồi phát lại để so sánh. */
function Shadow({ text, role }: { text: string; role: 'A' | 'B' }) {
  const [state, setState] = useState<'idle' | 'rec' | 'play'>('idle')
  const urlRef = useRef<string | null>(null)

  const run = async () => {
    if (state !== 'idle') return
    const rel = await resolveAudio(text, { role })
    if (!rel) return
    const model = new Audio(mediaUrl(rel))
    model.playbackRate = getRate()
    await new Promise<void>((r) => {
      model.onloadedmetadata = () => r()
      model.onerror = () => r()
    })
    const dur = (isFinite(model.duration) ? model.duration : 3) / getRate()
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      alert('Không truy cập được micro.')
      return
    }
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    setState('rec')
    rec.start()
    await model.play()
    await new Promise((r) => setTimeout(r, dur * 1000 + 700))
    rec.stop()
    await new Promise((r) => (rec.onstop = r))
    stream.getTracks().forEach((t) => t.stop())
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }))
    setState('play')
    const mine = new Audio(urlRef.current)
    await mine.play().catch(() => {})
    await new Promise((r) => (mine.onended = r))
    setState('idle')
  }

  return (
    <button
      title="Shadowing: nói đuổi theo câu mẫu, sau đó nghe lại giọng mình"
      onClick={run}
      className={cx(
        'flex h-8 w-8 items-center justify-center rounded-full transition',
        state === 'rec' ? 'animate-pulse bg-accent text-white' : state === 'play' ? 'bg-good-soft text-good' : 'text-muted hover:bg-paper hover:text-ink'
      )}
    >
      <IconMic size={15} />
    </button>
  )
}
