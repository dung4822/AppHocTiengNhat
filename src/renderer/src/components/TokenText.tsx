import { useEffect, useState } from 'react'
import { type ApiResult, call } from '@/lib/api'
import { playText } from '@/lib/audio'
import { Furigana, PitchAccent } from './jp'
import { IconPlus, IconSparkles, IconX } from './icons'
import { AudioButton, Badge, Button, Spinner, cx } from './ui'

export type Passage = NonNullable<ApiResult<'passage.get'>>
export type Sent = Passage['sentences'][number]
export type ATok = Sent['toks'][number]

export type FuriMode = 'all' | 'unknown' | 'none'

const STATUS_STYLE: Record<string, string> = {
  unknown: 'decoration-accent/70 underline decoration-dotted underline-offset-[6px]',
  new: 'decoration-indigo/70 underline decoration-dotted underline-offset-[6px]',
  learning: 'bg-warn-soft/60',
  known: '',
  skip: ''
}

/** Câu tiếng Nhật đã tách từ: bấm vào từ để tra; furigana theo chế độ. */
export function TokenSentence({ sent, furi, onPick, highlight }: { sent: Sent; furi: FuriMode; onPick: (t: ATok, sent: Sent) => void; highlight?: boolean }) {
  return (
    <span className={cx('jp leading-[2.4]', highlight && 'rounded bg-indigo-soft/60')}>
      {sent.toks.map((t, i) => {
        const showFuri = furi === 'all' || (furi === 'unknown' && t.status !== 'known' && t.status !== 'skip')
        if (t.status === 'skip') return <Furigana key={i} segs={t.f} show={furi === 'all'} />
        return (
          <span
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              onPick(t, sent)
            }}
            className={cx('cursor-pointer rounded transition hover:bg-line/70', STATUS_STYLE[t.status])}
          >
            <Furigana segs={t.f} show={showFuri} />
          </span>
        )
      })}
    </span>
  )
}

type Lookup = ApiResult<'word.lookup'>

/** Bảng tra từ (hiện khi bấm vào một từ trong bài). */
export function WordPanel({ tok, sent, onClose, onAdded }: { tok: ATok; sent: Sent; onClose: () => void; onAdded?: () => void }) {
  const [data, setData] = useState<Lookup | null>(null)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [explain, setExplain] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  useEffect(() => {
    let alive = true
    setData(null)
    setAdded(false)
    setExplain(null)
    void call('word.lookup', tok.b, tok.s).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [tok.b, tok.s])
  const reading = data?.vocab?.reading ?? data?.dict[0]?.reading ?? tok.r

  return (
    <div className="card fade-in p-5 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="jp text-3xl">{data?.vocab?.word ?? tok.b}</div>
          <div className="mt-1 flex items-center gap-2">
            <PitchAccent reading={reading} accent={data?.vocab?.pitch?.[0]} />
            <AudioButton size="sm" onPlay={() => playText(reading, { accent: data?.vocab?.pitch?.[0] ?? null })} />
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink"><IconX /></button>
      </div>
      {!data ? (
        <div className="py-4"><Spinner /></div>
      ) : data.vocab ? (
        <div className="mt-3">
          <div className="text-lg font-semibold">{data.vocab.vi}</div>
          {data.vocab.note && <div className="text-sm text-muted">{data.vocab.note}</div>}
          <div className="mt-2 flex gap-1.5">
            <Badge tone="indigo">N{data.vocab.level || '+'}</Badge>
            <Badge tone={data.state === 2 ? 'good' : data.state === 0 ? 'muted' : 'accent'}>
              {data.state === 2 ? 'đã thuộc' : data.state === 0 ? 'chưa học' : 'đang học'}
            </Badge>
          </div>
          {data.kanji.map((k) => (
            <div key={k.char} className="mt-2 text-sm">
              <span className="jp">{k.char}</span> <b className="text-accent">{k.hv}</b> <span className="text-muted">{k.vi}</span>
            </div>
          ))}
        </div>
      ) : data.dict.length ? (
        <div className="mt-3 space-y-1 text-sm">
          {data.dict.map((d, i) => (
            <div key={i}>
              <span className="jp">{d.word}【{d.reading}】</span> <span className="text-muted">{d.en}</span>
            </div>
          ))}
          <div className="text-xs text-muted">(Từ ngoài danh sách N5–N3 — nghĩa tiếng Anh từ JMdict)</div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted">Không có trong từ điển (có thể là dạng chia / tên riêng).</div>
      )}

      {explain && <div className="mt-3 rounded-lg bg-paper p-3 text-sm leading-relaxed whitespace-pre-wrap">{explain}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {data && (data.vocab ? data.state === 0 : data.dict.length > 0) && (
          <Button
            size="sm"
            variant="primary"
            disabled={adding || added}
            onClick={async () => {
              setAdding(true)
              try {
                await call('word.add', data.vocab?.word ?? data.dict[0].word, data.vocab?.reading ?? data.dict[0].reading)
                setAdded(true)
                onAdded?.()
              } finally {
                setAdding(false)
              }
            }}
          >
            <IconPlus size={14} /> {added ? 'Đã thêm vào học ngay' : adding ? 'Đang tạo thẻ…' : 'Học từ này'}
          </Button>
        )}
        <Button
          size="sm"
          disabled={explaining}
          onClick={async () => {
            setExplaining(true)
            try {
              setExplain(await call('ai.explain', tok.s, sent.jp))
            } catch (e) {
              setExplain('Lỗi AI: ' + (e as Error).message)
            } finally {
              setExplaining(false)
            }
          }}
        >
          <IconSparkles size={14} /> {explaining ? 'Đang hỏi AI…' : 'AI giải thích trong câu'}
        </Button>
      </div>
    </div>
  )
}
