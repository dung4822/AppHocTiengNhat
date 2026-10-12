import { useState } from 'react'
import { type CardRenderProps, ReviewSession } from '@/components/ReviewSession'
import { Furigana } from '@/components/jp'
import { AudioButton, Badge, Button, Card, PageHeader, Segmented, Spinner, Tabs, cx } from '@/components/ui'
import { call } from '@/lib/api'
import { playText } from '@/lib/audio'
import { useAsync } from '@/lib/hooks'
import { ListenHelp } from '@/components/ListenHelp'

type Tab = 'review' | 'list'

export default function GrammarPage() {
  const [tab, setTab] = useState<Tab>('review')
  return (
    <div>
      <PageHeader title="Ngữ pháp" jp="文法" subtitle="Mẫu ngữ pháp N5 → N3 · ôn bằng câu điền chỗ trống (mỗi lần một câu ví dụ khác)" />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'review', label: 'Ôn tập' }, { value: 'list', label: 'Danh sách mẫu' }]} />
      {tab === 'review' ? (
        <ReviewSession
          deck="grammar"
          module="grammar"
          render={(p) => <GrammarCard {...p} />}
          onReveal={(v) => {
            const g = v.grammar!
            const ex = g.examples[v.exampleIndex ?? 0]
            if (ex) void playText(ex.jp)
          }}
        />
      ) : (
        <GrammarList />
      )}
    </div>
  )
}

function Cloze({ jp, ans, revealed }: { jp: string; ans: string; revealed: boolean }) {
  const i = jp.indexOf(ans)
  if (i < 0) return <span className="jp">{jp}</span>
  return (
    <span className="jp">
      {jp.slice(0, i)}
      <span className={cx('mx-0.5 rounded-md px-1', revealed ? 'bg-accent-soft font-semibold text-accent' : 'bg-line text-transparent select-none')}>
        {revealed ? ans : ans.replace(/./g, '＿')}
      </span>
      {jp.slice(i + ans.length)}
    </span>
  )
}

function GrammarCard({ view, revealed, intro }: CardRenderProps) {
  const g = view.grammar!
  const ex = g.examples[view.exampleIndex ?? 0]
  return (
    <div>
      {ex ? (
        <div className="text-center">
          <div className="text-sm text-muted">{ex.vi}</div>
          <div className="mt-3 text-3xl leading-relaxed">
            <Cloze jp={ex.jp} ans={ex.ans} revealed={revealed} />
          </div>
          {!revealed && <div className="mt-4 text-sm text-muted">Điền mẫu ngữ pháp còn thiếu (nhớ trong đầu rồi lật thẻ)</div>}
        </div>
      ) : (
        <div className="jp text-center text-3xl">{g.pattern}</div>
      )}

      {revealed && (
        <div className="fade-in mt-6 border-t border-line pt-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="jp text-2xl font-semibold">{g.pattern}</span>
            <Badge tone="indigo">N{g.level}</Badge>
            {intro && <Badge tone="accent">Mẫu mới</Badge>}
          </div>
          <div className="mt-1 text-lg">{g.meaning}</div>
          <div className="jp mt-2 inline-block rounded-lg bg-paper px-3 py-1.5 text-sm">{g.structure}</div>
          <p className="mt-3 text-sm leading-relaxed text-muted">{g.explain}</p>
          <div className="mt-4 space-y-2">
            {g.examples.map((e, i) => (
              <div key={i} className={cx('flex items-start gap-3 rounded-xl p-3', i === view.exampleIndex ? 'bg-paper' : '')}>
                <AudioButton size="sm" onPlay={() => playText(e.jp)} />
                <div>
                  <Furigana segs={e.furi.length ? e.furi : [{ t: e.jp }]} className="text-lg leading-loose" />
                  <div className="text-sm text-muted">{e.vi}</div>
                  <ListenHelp text={e.jp} className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GrammarList() {
  const [level, setLevel] = useState(5)
  const [open, setOpen] = useState<number | null>(null)
  const { data, loading, reload } = useAsync(() => call('grammar.list', level), [level])
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Segmented value={level} onChange={setLevel} items={[{ value: 5, label: 'N5' }, { value: 4, label: 'N4' }, { value: 3, label: 'N3' }]} />
        <span className="text-sm text-muted">{data ? `${data.filter((g) => g.state !== 0).length}/${data.length} mẫu đã học` : ''}</span>
      </div>
      {loading && !data ? (
        <div className="flex justify-center p-10"><Spinner /></div>
      ) : (
        <Card className="divide-y divide-line">
          {data?.map((g) => (
            <div key={g.id}>
              <button onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-paper">
                <span className="w-6 text-xs text-muted tabular-nums">{g.rank}</span>
                <span className="jp w-56 shrink-0 font-medium">{g.pattern}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{g.meaning}</span>
                {g.state === 0 ? <Badge>chưa học</Badge> : g.state === 2 ? <Badge tone="good">đang ôn</Badge> : <Badge tone="accent">đang học</Badge>}
              </button>
              {open === g.id && (
                <div className="fade-in bg-paper/60 px-14 pt-1 pb-4 text-sm">
                  <div className="jp mb-2 inline-block rounded-lg bg-surface px-3 py-1">{g.structure}</div>
                  <p className="mb-3 leading-relaxed text-muted">{g.explain}</p>
                  {g.examples.map((e, i) => (
                    <div key={i} className="mb-2 flex items-start gap-2">
                      <AudioButton size="sm" onPlay={() => playText(e.jp)} />
                      <div>
                        <Furigana segs={e.furi} className="leading-loose" />
                        <div className="text-muted">{e.vi}</div>
                        <ListenHelp text={e.jp} className="mt-1" />
                      </div>
                    </div>
                  ))}
                  {g.state === 0 && (
                    <Button size="sm" className="mt-2" onClick={async () => { await call('srs.learnNow', 'grammar', g.id); await reload() }}>
                      Học mẫu này tiếp theo
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
