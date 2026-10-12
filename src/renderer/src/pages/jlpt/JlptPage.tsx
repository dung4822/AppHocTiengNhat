import { useState } from 'react'
import { type JQuestion, QuizRunner, TYPE_LABEL } from '@/components/Quiz'
import { IconSparkles } from '@/components/icons'
import { Button, Card, Empty, PageHeader, Spinner, cx } from '@/components/ui'
import { call } from '@/lib/api'
import { useAsync, useStudyTimer } from '@/lib/hooks'

type QType = JQuestion['type']

const MODES: { id: string; title: string; jp: string; desc: string; types: QType[]; count: number; ai?: boolean }[] = [
  { id: 'mixed', title: 'Đề tổng hợp', jp: '模擬テスト', desc: '30 câu trộn đủ các dạng 文字・語彙・文法 như đề thật.', types: ['kanjiReading', 'orthography', 'context', 'grammar'], count: 30 },
  { id: 'kanji', title: 'Đọc kanji', jp: '漢字読み', desc: 'Chọn cách đọc của từ gạch chân. Bẫy trường âm, âm ngắt, âm đục.', types: ['kanjiReading'], count: 20 },
  { id: 'ortho', title: 'Chọn chữ', jp: '表記', desc: 'Chọn kanji đúng cho từ viết bằng hiragana. Bẫy chữ cùng âm.', types: ['orthography'], count: 20 },
  { id: 'context', title: 'Điền từ', jp: '文脈規定', desc: 'Chọn từ hợp ngữ cảnh câu.', types: ['context'], count: 20 },
  { id: 'grammar', title: 'Ngữ pháp', jp: '文法形式', desc: 'Chọn mẫu ngữ pháp đúng điền vào chỗ trống.', types: ['grammar'], count: 20 },
  { id: 'ai', title: 'Đồng nghĩa & cách dùng', jp: '言い換え・用法', desc: 'AI tạo câu hỏi từ vốn từ của bạn (~0,001 USD/lượt).', types: [], count: 10, ai: true }
]

export default function JlptPage() {
  const [qs, setQs] = useState<{ q: JQuestion[]; kind: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const history = useAsync(() => call('jlpt.history'), [qs])
  useStudyTimer('jlpt', !!qs)

  const start = async (m: (typeof MODES)[number]) => {
    setLoading(m.id)
    setErr(null)
    try {
      const q = m.ai ? await call('jlpt.makeAI', m.count) : await call('jlpt.make', m.types, m.count)
      setQs({ q, kind: m.id })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  if (qs)
    return qs.q.length ? (
      <QuizRunner questions={qs.q} kind={qs.kind} onExit={() => setQs(null)} />
    ) : (
      <Empty title="Chưa đủ dữ liệu để tạo đề">Hãy học thêm từ vựng/ngữ pháp trước. <Button className="mt-4" onClick={() => setQs(null)}>Quay lại</Button></Empty>
    )

  return (
    <div>
      <PageHeader title="Luyện đề JLPT" jp="模試" subtitle="Câu hỏi đúng dạng đề thi, sinh từ chính những gì bạn đã học" />
      {err && <div className="mb-4 text-sm text-accent">{err}</div>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => (
          <Card key={m.id} className={cx('flex flex-col p-6', m.id === 'mixed' && 'md:col-span-2 lg:col-span-1')}>
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-semibold">{m.title}</div>
              <div className="jp text-sm text-muted">{m.jp}</div>
            </div>
            <p className="mt-2 flex-1 text-sm text-muted">{m.desc}</p>
            <Button className="mt-4" variant={m.id === 'mixed' ? 'primary' : 'secondary'} disabled={!!loading} onClick={() => start(m)}>
              {loading === m.id ? <Spinner className="h-4 w-4" /> : m.ai ? <IconSparkles size={16} /> : null}
              {loading === m.id ? 'Đang tạo…' : `Làm ${m.count} câu`}
            </Button>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-2 text-sm font-medium text-muted">Lịch sử gần đây</div>
        <Card className="divide-y divide-line">
          {history.data?.length ? (
            history.data.slice(0, 15).map((h) => (
              <div key={h.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-36 text-muted">{new Date(h.ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="flex-1">{MODES.find((m) => m.id === h.kind)?.title ?? TYPE_LABEL[h.kind] ?? (h.kind === 'listening' ? 'Nghe nhanh' : h.kind)}</span>
                <span className="tabular-nums">{h.correct}/{h.total}</span>
                <span className={cx('w-12 text-right font-medium tabular-nums', h.correct / h.total >= 0.8 ? 'text-good' : h.correct / h.total >= 0.6 ? 'text-warn' : 'text-accent')}>
                  {Math.round((h.correct / h.total) * 100)}%
                </span>
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-muted">Chưa làm bài nào.</div>
          )}
        </Card>
      </div>
    </div>
  )
}
