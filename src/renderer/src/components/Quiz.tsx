import { type ReactNode, useEffect, useState } from 'react'
import type { ApiResult } from '@/lib/api'
import { call } from '@/lib/api'
import { playText } from '@/lib/audio'
import { useKeys } from '@/lib/hooks'
import { IconCheck, IconRepeat, IconX } from './icons'
import { AudioButton, Badge, Button, Card, Kbd, cx } from './ui'
import { ListenHelp } from './ListenHelp'

export type JQuestion = ApiResult<'jlpt.make'>[number]

export const TYPE_LABEL: Record<string, string> = {
  kanjiReading: '漢字読み · Đọc kanji',
  orthography: '表記 · Chọn chữ kanji',
  context: '文脈規定 · Điền từ',
  grammar: '文法 · Ngữ pháp',
  paraphrase: '言い換え · Đồng nghĩa',
  usage: '用法 · Cách dùng',
  listenWord: '聴解 · Nghe từ',
  listenSentence: '聴解 · Nghe câu'
}

const INSTRUCTION: Record<string, string> = {
  kanjiReading: 'Chọn cách đọc đúng của từ gạch chân.',
  orthography: 'Chọn cách viết kanji đúng của từ gạch chân.',
  context: 'Chọn từ thích hợp điền vào（　　）.',
  grammar: 'Chọn mẫu ngữ pháp thích hợp điền vào（　　）.',
  paraphrase: 'Chọn từ/cụm từ gần nghĩa nhất với từ gạch chân.',
  usage: 'Chọn câu dùng từ này đúng nhất.',
  listenWord: 'Nghe và chọn nghĩa đúng.',
  listenSentence: 'Nghe câu và chọn nghĩa đúng.'
}

/** Hiển thị đề: [[...]] = gạch chân. */
export function Prompt({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/)
  return (
    <span className="jp">
      {parts.map((p, i) =>
        p.startsWith('[[') ? (
          <span key={i} className="underline decoration-2 underline-offset-[6px]">
            {p.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  )
}

/** Làm một bộ câu hỏi trắc nghiệm, chấm ngay từng câu (phím 1–4, Enter để tiếp). */
export function QuizRunner({ questions, kind, onExit, header }: { questions: JQuestion[]; kind: string; onExit: () => void; header?: ReactNode }) {
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [results, setResults] = useState<boolean[]>([])
  const [finished, setFinished] = useState(false)
  const q = questions[i]

  useEffect(() => {
    if (q?.audio && !finished) void playText(q.audio.text, { accent: q.audio.accent ?? null })
  }, [i, q, finished])

  const choose = (c: number) => {
    if (chosen !== null || !q) return
    setChosen(c)
    setResults((r) => [...r, c === q.answer])
  }
  const next = async () => {
    if (chosen === null) return
    if (i + 1 >= questions.length) {
      setFinished(true)
      const correct = results.filter(Boolean).length
      await call('jlpt.saveResult', kind, questions.length, correct, questions.map((qq, k) => ({ type: qq.type, ok: results[k] })))
    } else {
      setI(i + 1)
      setChosen(null)
    }
  }

  useKeys(
    {
      '1': () => choose(0),
      '2': () => choose(1),
      '3': () => choose(2),
      '4': () => choose(3),
      Enter: () => void next(),
      ' ': () => void next(),
      r: () => q?.audio && void playText(q.audio.text, { accent: q.audio.accent ?? null })
    },
    [i, chosen, q, results]
  )

  if (finished) {
    const correct = results.filter(Boolean).length
    const byType = new Map<string, { ok: number; n: number }>()
    questions.forEach((qq, k) => {
      const t = byType.get(qq.type) ?? { ok: 0, n: 0 }
      t.n++
      if (results[k]) t.ok++
      byType.set(qq.type, t)
    })
    return (
      <Card className="p-8 text-center fade-in">
        <div className="text-sm text-muted">Kết quả</div>
        <div className="mt-2 text-5xl font-semibold tabular-nums">
          {correct}<span className="text-2xl text-muted">/{questions.length}</span>
        </div>
        <div className="mt-1 text-muted">{Math.round((correct / questions.length) * 100)}% chính xác</div>
        <div className="mx-auto mt-6 max-w-sm space-y-1 text-left text-sm">
          {[...byType.entries()].map(([t, v]) => (
            <div key={t} className="flex justify-between">
              <span>{TYPE_LABEL[t] ?? t}</span>
              <span className="tabular-nums">{v.ok}/{v.n}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={onExit}>Quay lại</Button>
        </div>
      </Card>
    )
  }

  if (!q) return null
  return (
    <div className="fade-in">
      <div className="mb-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {header}
          <Badge tone="indigo">{TYPE_LABEL[q.type] ?? q.type}</Badge>
        </div>
        <div className="flex items-center gap-3 text-muted tabular-nums">
          <span className="text-good">{results.filter(Boolean).length} đúng</span>
          <span>{i + 1}/{questions.length}</span>
          <Button size="sm" variant="ghost" onClick={onExit}>Thoát</Button>
        </div>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-ink transition-all" style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>
      <Card className="p-8">
        <div className="mb-3 text-sm text-muted">{INSTRUCTION[q.type]}</div>
        {q.audio ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <AudioButton size="lg" onPlay={() => playText(q.audio!.text, { accent: q.audio!.accent ?? null })} />
            <span className="text-xs text-muted">Phím R để nghe lại</span>
          </div>
        ) : (
          <div className="text-2xl leading-loose">
            <Prompt text={q.prompt} />
          </div>
        )}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {q.choices.map((c, k) => {
            const isAns = chosen !== null && k === q.answer
            const isWrong = chosen === k && k !== q.answer
            return (
              <button
                key={k}
                onClick={() => choose(k)}
                className={cx(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                  chosen === null && 'border-line hover:border-ink',
                  isAns && 'border-good bg-good-soft',
                  isWrong && 'border-accent bg-accent-soft',
                  chosen !== null && !isAns && !isWrong && 'border-line opacity-60'
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs">
                  {isAns ? <IconCheck size={14} /> : isWrong ? <IconX size={14} /> : k + 1}
                </span>
                <span className={cx(/[぀-ヿ一-鿿]/.test(c) && 'jp text-lg')}>{c}</span>
              </button>
            )
          })}
        </div>
        {chosen !== null && (
          <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-paper p-4 fade-in">
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {q.audio && <div className="jp mb-1 text-base">{q.audio.text}</div>}
              {q.audio && <ListenHelp text={q.audio.text} kind={q.type === 'listenWord' ? 'word' : 'sentence'} className="mb-2" />}
              {q.explain}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {q.audio && <AudioButton size="sm" onPlay={() => playText(q.audio!.text)} />}
              <Button variant="primary" onClick={next}>
                {i + 1 >= questions.length ? 'Xem kết quả' : 'Tiếp'} <Kbd>Enter</Kbd>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export function RetryIcon() {
  return <IconRepeat size={14} />
}
