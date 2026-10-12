import { useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { QuizRunner, type JQuestion } from '@/components/Quiz'
import { IconPlus, IconTrash } from '@/components/icons'
import { Badge, Button, Card, Empty, PageHeader, Segmented, Spinner, Tabs } from '@/components/ui'
import { call } from '@/lib/api'
import { useAsync, useStudyTimer } from '@/lib/hooks'
import { ListeningPlayer } from './ListeningPlayer'
import { Playlist } from './Playlist'

type Tab = 'lessons' | 'quick' | 'playlist'

export default function ListeningPage() {
  return (
    <Routes>
      <Route index element={<ListeningHome />} />
      <Route path=":id" element={<ListeningPlayer />} />
    </Routes>
  )
}

function ListeningHome() {
  const [tab, setTab] = useState<Tab>('lessons')
  return (
    <div>
      <PageHeader title="Nghe" jp="聴解" subtitle="Input nghe hiểu: bài nghe AI theo đúng vốn từ của bạn · nghe nhanh · nghe lại từ đã học" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'lessons', label: 'Bài nghe' },
          { value: 'quick', label: 'Nghe nhanh' },
          { value: 'playlist', label: 'Nghe lại từ đã học' }
        ]}
      />
      {tab === 'lessons' && <Lessons />}
      {tab === 'quick' && <QuickListening />}
      {tab === 'playlist' && <Playlist />}
    </div>
  )
}

function Lessons() {
  const nav = useNavigate()
  const { data, loading, reload } = useAsync(() => call('passage.list', 'listening'), [])
  const profile = useAsync(() => call('content.profile'), [])
  const [kind, setKind] = useState<'dialogue' | 'monologue'>('dialogue')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setErr(null)
    try {
      const id = await call('listening.generate', { kind, topic })
      nav(`/listening/${id}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-60 flex-1">
            <div className="mb-1 text-sm font-medium">Tạo bài nghe mới</div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Chủ đề (để trống = ngẫu nhiên), VD: đi mua giày"
              className="h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <Segmented size="md" value={kind} onChange={setKind} items={[{ value: 'dialogue', label: 'Hội thoại' }, { value: 'monologue', label: 'Độc thoại' }]} />
          <Button variant="primary" onClick={create} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4 border-paper/40 border-t-paper" /> : <IconPlus size={16} />}
            {busy ? 'AI đang viết…' : 'Tạo bài'}
          </Button>
        </div>
        {profile.data && (
          <div className="mt-3 text-xs text-muted">
            Trình độ hiện tại: <b>N{profile.data.level}</b> · {profile.data.knownCount} từ đã học · bài nghe sẽ lồng ghép từ sắp học:{' '}
            <span className="jp">{profile.data.targets.join('、') || '—'}</span>
          </div>
        )}
        {err && <div className="mt-3 text-sm text-accent">{err}</div>}
      </Card>

      <div>
        <div className="mb-2 text-sm font-medium text-muted">Cách học hiệu quả: nghe 2 lần không xem lời → trả lời câu hỏi → xem lời + dịch → shadowing từng câu.</div>
        {loading && !data ? (
          <Spinner />
        ) : !data?.length ? (
          <Empty title="Chưa có bài nghe">Bấm “Tạo bài” — AI sẽ viết bài dùng đúng các từ bạn đã học, rồi AivisSpeech đọc.</Empty>
        ) : (
          <Card className="divide-y divide-line">
            {data.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
                <button className="min-w-0 flex-1 text-left" onClick={() => nav(`/listening/${p.id}`)}>
                  <div className="jp truncate font-medium">{p.title}</div>
                  <div className="truncate text-xs text-muted">{p.titleVi} · {p.lines} câu</div>
                </button>
                <Badge tone="indigo">N{p.level}</Badge>
                {p.doneCount > 0 && <Badge tone="good">đã nghe {p.doneCount}×</Badge>}
                <button
                  className="text-muted hover:text-accent"
                  title="Xoá"
                  onClick={async () => {
                    if (confirm('Xoá bài này?')) {
                      await call('passage.delete', p.id)
                      await reload()
                    }
                  }}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}

function QuickListening() {
  const [qs, setQs] = useState<JQuestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  useStudyTimer('listening', !!qs)
  const start = async (types: ('listenWord' | 'listenSentence')[]) => {
    setLoading(true)
    try {
      setQs(await call('jlpt.make', types, 20))
    } finally {
      setLoading(false)
    }
  }
  if (qs) return qs.length ? <QuizRunner questions={qs} kind="listening" onExit={() => setQs(null)} /> : <Empty title="Chưa đủ từ để tạo câu hỏi">Hãy học thêm vài từ ở phần Từ vựng.</Empty>
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[
        { t: ['listenWord'] as const, title: 'Nghe từ', desc: 'Nghe một từ đã học → chọn nghĩa. Luyện phản xạ nhận diện âm.' },
        { t: ['listenSentence'] as const, title: 'Nghe câu', desc: 'Nghe câu ví dụ → chọn nghĩa. Luyện hiểu câu ở tốc độ tự nhiên.' },
        { t: ['listenWord', 'listenSentence'] as const, title: 'Trộn', desc: '20 câu xen kẽ từ và câu.' }
      ].map((m) => (
        <Card key={m.title} className="flex flex-col p-6">
          <div className="text-lg font-semibold">{m.title}</div>
          <p className="mt-1 flex-1 text-sm text-muted">{m.desc}</p>
          <Button className="mt-4" variant="primary" disabled={loading} onClick={() => start([...m.t])}>Bắt đầu</Button>
        </Card>
      ))}
    </div>
  )
}
