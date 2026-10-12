import { useState } from 'react'
import { IconCheck, IconX } from '@/components/icons'
import type { Passage } from '@/components/TokenText'
import { Button, Card, cx } from '@/components/ui'

/** Câu hỏi đọc/nghe hiểu kiểu đề JLPT ở cuối bài. */
export function QuestionsBlock({ passage, onDone }: { passage: Passage; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const qs = passage.questions
  if (!qs.length) return null
  const correct = qs.filter((q, i) => answers[i] === q.answer).length

  return (
    <Card className="mt-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-semibold">Câu hỏi hiểu bài</div>
        {submitted && <div className="text-sm tabular-nums">Đúng {correct}/{qs.length}</div>}
      </div>
      <div className="space-y-6">
        {qs.map((q, i) => (
          <div key={i}>
            <div className="jp mb-2 text-lg">{i + 1}. {q.q}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.choices.map((c, k) => {
                const chosen = answers[i] === k
                const right = submitted && k === q.answer
                const wrong = submitted && chosen && k !== q.answer
                return (
                  <button
                    key={k}
                    disabled={submitted}
                    onClick={() => setAnswers({ ...answers, [i]: k })}
                    className={cx(
                      'jp flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition',
                      !submitted && chosen && 'border-ink bg-paper',
                      !submitted && !chosen && 'border-line hover:border-ink',
                      right && 'border-good bg-good-soft',
                      wrong && 'border-accent bg-accent-soft',
                      submitted && !right && !wrong && 'border-line opacity-60'
                    )}
                  >
                    {right ? <IconCheck size={14} /> : wrong ? <IconX size={14} /> : <span className="text-xs text-muted">{k + 1}</span>}
                    {c}
                  </button>
                )
              })}
            </div>
            {submitted && q.explain && <div className="mt-2 text-sm text-muted">{q.explain}</div>}
          </div>
        ))}
      </div>
      {!submitted && (
        <Button
          className="mt-6"
          variant="primary"
          disabled={Object.keys(answers).length < qs.length}
          onClick={() => {
            setSubmitted(true)
            onDone()
          }}
        >
          Nộp bài
        </Button>
      )}
    </Card>
  )
}
