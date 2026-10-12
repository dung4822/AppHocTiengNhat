import { useEffect, useState } from 'react'
import { Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { type ATok, type FuriMode, type Passage, type Sent, TokenSentence, WordPanel } from '@/components/TokenText'
import { IconChevronLeft, IconPlus, IconTrash, IconVolume } from '@/components/icons'
import { Badge, Button, Card, Empty, PageHeader, Segmented, Spinner, Toggle, cx } from '@/components/ui'
import { call } from '@/lib/api'
import { playSequence, playText, stopAudio } from '@/lib/audio'
import { useAsync, useStudyTimer } from '@/lib/hooks'
import { useSettings } from '@/lib/settings'
import { QuestionsBlock } from './QuestionsBlock'

export default function ReadingPage() {
  return (
    <Routes>
      <Route index element={<ReadingHome />} />
      <Route path=":id" element={<Reader />} />
    </Routes>
  )
}

function ReadingHome() {
  const nav = useNavigate()
  const { data, loading, reload } = useAsync(() => call('passage.list', 'reading'), [])
  const profile = useAsync(() => call('content.profile'), [])
  const [topic, setTopic] = useState('')
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setErr(null)
    try {
      nav(`/reading/${await call('reading.generate', { topic, length })}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Đọc" jp="読解" subtitle="Bài đọc i+1: AI viết bằng đúng từ bạn đã học + vài từ sắp học. Bấm vào từ để tra, thêm vào thẻ ôn." />
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-60 flex-1">
            <div className="mb-1 text-sm font-medium">Tạo bài đọc mới</div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Chủ đề (để trống = ngẫu nhiên)"
              className="h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <Segmented size="md" value={length} onChange={setLength} items={[{ value: 'short', label: 'Ngắn' }, { value: 'medium', label: 'Vừa' }, { value: 'long', label: 'Dài' }]} />
          <Button variant="primary" onClick={create} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4 border-paper/40 border-t-paper" /> : <IconPlus size={16} />}
            {busy ? 'AI đang viết…' : 'Tạo bài'}
          </Button>
        </div>
        {profile.data && (
          <div className="mt-3 text-xs text-muted">
            Trình độ: <b>N{profile.data.level}</b> · {profile.data.knownCount} từ đã học · từ mục tiêu: <span className="jp">{profile.data.targets.join('、') || '—'}</span>
          </div>
        )}
        {err && <div className="mt-3 text-sm text-accent">{err}</div>}
      </Card>
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty title="Chưa có bài đọc">Tạo bài đầu tiên. Mỗi bài tốn khoảng 0,002 USD.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {data.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
              <button className="min-w-0 flex-1 text-left" onClick={() => nav(`/reading/${p.id}`)}>
                <div className="jp truncate font-medium">{p.title}</div>
                <div className="truncate text-xs text-muted">{p.titleVi} · {p.lines} câu · {new Date(p.created).toLocaleDateString('vi-VN')}</div>
              </button>
              <Badge tone="indigo">N{p.level}</Badge>
              {p.doneCount > 0 && <Badge tone="good">đã đọc</Badge>}
              <button className="text-muted hover:text-accent" onClick={async () => { if (confirm('Xoá bài này?')) { await call('passage.delete', p.id); await reload() } }}>
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function Reader() {
  const { id } = useParams()
  const { data, reload } = useAsync(() => call('passage.get', Number(id)), [id])
  if (!data) return <div className="flex justify-center py-20"><Spinner /></div>
  return <ReaderInner p={data as Passage} reload={reload} />
}

function ReaderInner({ p, reload }: { p: Passage; reload: () => void }) {
  const nav = useNavigate()
  const { settings } = useSettings()
  const [furi, setFuri] = useState<FuriMode>((settings?.readingFurigana as FuriMode) ?? 'unknown')
  const [showVi, setShowVi] = useState<Set<number>>(new Set())
  const [allVi, setAllVi] = useState(false)
  const [pick, setPick] = useState<{ tok: ATok; sent: Sent } | null>(null)
  const [cur, setCur] = useState(-1)
  const [reading, setReading] = useState(false)
  useStudyTimer('reading')
  useEffect(() => () => stopAudio(), [])

  const counts = p.sentences.flatMap((s) => s.toks).reduce(
    (a, t) => {
      a[t.status] = (a[t.status] ?? 0) + 1
      return a
    },
    {} as Record<string, number>
  )

  return (
    <div className="fade-in">
      <button onClick={() => nav('/reading')} className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-ink">
        <IconChevronLeft size={16} /> Thư viện bài đọc
      </button>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={furi} onChange={setFuri} items={[{ value: 'all', label: 'Furigana: tất cả' }, { value: 'unknown', label: 'chỉ từ chưa thuộc' }, { value: 'none', label: 'không' }]} />
          <Toggle checked={allVi} onChange={setAllVi} label="Dịch tất cả" />
          <Button
            size="sm"
            onClick={async () => {
              if (reading) {
                stopAudio()
                setReading(false)
                return
              }
              setReading(true)
              await playSequence(p.sentences.map((s) => ({ text: s.jp, gapMs: 350 })), setCur)
              setReading(false)
            }}
          >
            <IconVolume size={14} /> {reading ? 'Dừng đọc' : 'Nghe cả bài'}
          </Button>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge tone="good">Đã biết {Math.round(p.coverage * 100)}%</Badge>
          {counts.unknown ? <Badge tone="accent">{counts.unknown} từ lạ</Badge> : null}
          {counts.new ? <Badge tone="indigo">{counts.new} từ sắp học</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-8">
          <div className="text-sm text-muted">{p.titleVi}</div>
          <h1 className="jp mb-6 text-3xl">{p.title}</h1>
          <div className="space-y-1 text-[22px]">
            {p.sentences.map((s, i) => (
              <div key={i} className="group">
                <span
                  onDoubleClick={() => void playText(s.jp)}
                  title="Nhấp đúp để nghe câu"
                >
                  <TokenSentence sent={s} furi={furi} highlight={cur === i} onPick={(tok, sent) => setPick({ tok, sent })} />
                </span>
                <button
                  className="ml-2 align-middle text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-ink"
                  onClick={() => setShowVi(new Set(showVi.has(i) ? [...showVi].filter((x) => x !== i) : [...showVi, i]))}
                >
                  dịch
                </button>
                <button className="ml-1 align-middle text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-ink" onClick={() => void playText(s.jp)}>
                  nghe
                </button>
                {(allVi || showVi.has(i)) && <div className={cx('mb-2 text-base text-muted')}>{s.vi}</div>}
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          {pick ? (
            <div className="sticky top-4">
              <WordPanel tok={pick.tok} sent={pick.sent} onClose={() => setPick(null)} onAdded={reload} />
            </div>
          ) : (
            <Card className="p-4 text-sm text-muted">
              <div className="mb-2 font-medium text-ink">Mẹo đọc</div>
              <ul className="list-disc space-y-1 pl-4">
                <li>Đọc lướt hết bài trước, đừng tra ngay.</li>
                <li>Gạch chấm đỏ = từ lạ, xanh = từ sắp học, nền vàng = đang học.</li>
                <li>Bấm từ để tra · “Học từ này” để đưa lên đầu hàng đợi thẻ.</li>
                <li>Đọc to lại cả bài (nhấp đúp câu để nghe mẫu).</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
      <QuestionsBlock passage={p} onDone={() => call('passage.done', p.id)} />
    </div>
  )
}
