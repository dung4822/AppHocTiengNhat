import { Link } from 'react-router-dom'
import { IconBook, IconCards, IconChevronRight, IconExam, IconFlame, IconHeadphones, IconPuzzle } from '@/components/icons'
import { Badge, Button, Card, Progress, Spinner, cx } from '@/components/ui'
import { call } from '@/lib/api'
import { useAsync } from '@/lib/hooks'

const MODULES = [
  { key: 'vocab', to: '/vocab', title: 'Từ vựng', jp: '語彙', icon: IconCards, color: 'bg-accent' },
  { key: 'listening', to: '/listening', title: 'Nghe', jp: '聴解', icon: IconHeadphones, color: 'bg-indigo' },
  { key: 'reading', to: '/reading', title: 'Đọc', jp: '読解', icon: IconBook, color: 'bg-good' },
  { key: 'grammar', to: '/grammar', title: 'Ngữ pháp', jp: '文法', icon: IconPuzzle, color: 'bg-warn' }
] as const

export default function HomePage() {
  const { data } = useAsync(async () => {
    const [vocab, grammar, time, overview] = await Promise.all([
      call('srs.counts', 'vocab'),
      call('srs.counts', 'grammar'),
      call('study.today'),
      call('stats.overview')
    ])
    return { vocab, grammar, time, overview }
  }, [])

  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>
  const { vocab, grammar, time, overview: o } = data
  const totalBudget = Object.values(time.budget).reduce((a, b) => a + b, 0)
  const totalDone = Object.values(time.seconds).reduce((a, b) => a + b, 0) / 60
  const hour = new Date().getHours()
  const greet = hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは'
  const vocabLeft = vocab.newCount + vocab.learnCount + vocab.reviewCount
  const grammarLeft = grammar.newCount + grammar.learnCount + grammar.reviewCount
  const allWords = o.levels.reduce((a, l) => a + l.total, 0)
  const knownWords = o.levels.reduce((a, l) => a + l.known, 0)

  return (
    <div className="fade-in">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="jp text-3xl font-semibold">{greet}</div>
          <div className="mt-1 text-muted">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })} · Mục tiêu hôm nay {totalBudget} phút
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2">
          <IconFlame className="text-accent" />
          <span className="text-xl font-semibold tabular-nums">{o.streak}</span>
          <span className="text-sm text-muted">ngày liên tiếp</span>
        </div>
      </div>

      {/* Tổng thời gian hôm nay */}
      <Card className="mb-6 p-6">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-medium">Thời gian học hôm nay</div>
          <div className="tabular-nums text-muted">
            <b className="text-ink">{Math.round(totalDone)}</b> / {totalBudget} phút
          </div>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-line">
          {MODULES.map((m) => (
            <div key={m.key} className={m.color} style={{ width: `${Math.min(100, ((time.seconds[m.key] ?? 0) / 60 / totalBudget) * 100)}%` }} />
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted">
          {MODULES.map((m) => (
            <span key={m.key} className="flex items-center gap-1.5">
              <span className={cx('h-2 w-2 rounded-full', m.color)} /> {m.title} {Math.round((time.seconds[m.key] ?? 0) / 60)}/{time.budget[m.key] ?? 0}′
            </span>
          ))}
        </div>
      </Card>

      {/* Kế hoạch theo module */}
      <div className="grid gap-4 md:grid-cols-2">
        {MODULES.map((m, idx) => {
          const done = (time.seconds[m.key] ?? 0) / 60
          const budget = time.budget[m.key] ?? 0
          const complete = done >= budget
          let detail: React.ReactNode = null
          if (m.key === 'vocab')
            detail = (
              <span className="tabular-nums">
                <span className="text-indigo">{vocab.newCount} mới</span> · <span className="text-accent">{vocab.learnCount} học</span> ·{' '}
                <span className="text-good">{vocab.reviewCount} ôn</span>
              </span>
            )
          if (m.key === 'grammar')
            detail = (
              <span className="tabular-nums">
                {grammar.newCount} mẫu mới · {grammar.reviewCount + grammar.learnCount} ôn
              </span>
            )
          if (m.key === 'listening') detail = 'Bài nghe AI · nghe nhanh · nghe lại từ'
          if (m.key === 'reading') detail = 'Bài đọc i+1 theo vốn từ của bạn'
          const left = m.key === 'vocab' ? vocabLeft : m.key === 'grammar' ? grammarLeft : null
          return (
            <Link key={m.key} to={m.to}>
              <Card className="group h-full p-5 transition hover:border-ink">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cx('flex h-10 w-10 items-center justify-center rounded-xl text-white', m.color)}>
                      <m.icon size={20} />
                    </div>
                    <div>
                      <div className="font-semibold">
                        <span className="mr-1 text-xs text-muted">{idx + 1}.</span>
                        {m.title} <span className="jp text-sm font-normal text-muted">{m.jp}</span>
                      </div>
                      <div className="text-xs text-muted">{detail}</div>
                    </div>
                  </div>
                  {complete ? <Badge tone="good">Đủ giờ</Badge> : left === 0 ? <Badge tone="good">Xong thẻ</Badge> : <IconChevronRight className="text-muted transition group-hover:translate-x-0.5" />}
                </div>
                <Progress className="mt-4" value={done} max={budget} color={m.color} />
                <div className="mt-1 text-right text-xs text-muted tabular-nums">{Math.round(done)}/{budget} phút</div>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Tiến độ N3 */}
      <Card className="mt-6 p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <div className="font-medium">Tiến độ tới N3</div>
          <div className="text-sm text-muted tabular-nums">
            {knownWords}/{allWords} từ · {o.kanji.known}/{o.kanji.total} kanji
            {o.etaDate ? ` · dự kiến học hết từ: ${new Date(o.etaDate).toLocaleDateString('vi-VN')}` : ''}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {o.levels.map((l) => (
            <div key={l.level}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold">N{l.level}</span>
                <span className="text-muted tabular-nums">{l.known}/{l.total}</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-line">
                <div className="absolute h-full bg-indigo/30" style={{ width: `${(l.seen / l.total) * 100}%` }} />
                <div className="absolute h-full bg-indigo" style={{ width: `${(l.known / l.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-dashed border-line p-5">
        <div>
          <div className="font-medium">Kiểm tra cuối ngày</div>
          <div className="text-sm text-muted">Làm 30 câu đúng dạng đề JLPT từ những gì đã học.</div>
        </div>
        <Link to="/jlpt">
          <Button><IconExam size={16} /> Luyện đề</Button>
        </Link>
      </div>
    </div>
  )
}
