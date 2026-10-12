import { useState } from 'react'
import type { CardRenderProps } from '@/components/ReviewSession'
import { Furigana, PitchAccent } from '@/components/jp'
import { AudioButton, Badge, cx } from '@/components/ui'
import { playText } from '@/lib/audio'

type View = CardRenderProps['view']
type Vocab = NonNullable<View['vocab']>

export const playWord = (v: Vocab) => playText(v.reading, { accent: v.pitch?.[0] ?? null })
export const playExample = (v: Vocab) => (v.ex ? playText(v.ex) : Promise.resolve(false))

/** Mặt trước + mặt sau của thẻ từ vựng. */
export function VocabCard({ view, revealed }: CardRenderProps) {
  const v = view.vocab!
  const listen = view.card.ord === 1
  const [hint, setHint] = useState(false)

  return (
    <div className="flex flex-col items-center">
      {/* ---------- Mặt trước ---------- */}
      {listen ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <AudioButton size="lg" onPlay={() => playWord(v)} />
          <div className="text-sm text-muted">Nghe và nhớ lại nghĩa <span className="opacity-60">(phím R để nghe lại)</span></div>
          {!revealed && v.ex && (
            <button className="text-xs text-muted underline-offset-2 hover:underline" onClick={() => playExample(v)}>
              Nghe câu ví dụ (E)
            </button>
          )}
        </div>
      ) : (
        <div className="py-2 text-center">
          {revealed ? (
            <Furigana segs={v.furi} className="text-6xl leading-[1.6] font-medium" />
          ) : (
            <div className="jp text-6xl leading-[1.6] font-medium">{v.word}</div>
          )}
          {!revealed && v.ex && (
            <div className="mt-4">
              {hint ? (
                <div className="jp text-lg text-muted">{v.ex}</div>
              ) : (
                <button className="text-xs text-muted hover:underline" onClick={() => setHint(true)}>
                  Gợi ý: xem câu ví dụ
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- Mặt sau ---------- */}
      {revealed && (
        <div className="fade-in mt-4 w-full border-t border-line pt-6">
          <div className="flex flex-col items-center text-center">
            {listen && <Furigana segs={v.furi} className="mb-1 text-4xl font-medium" />}
            <div className="flex items-center gap-3">
              <PitchAccent reading={v.reading} accent={v.pitch?.[0]} className="text-lg" />
              <AudioButton size="sm" onPlay={() => playWord(v)} />
            </div>
            <div className="mt-3 text-2xl font-semibold">{v.vi}</div>
            {v.note && <div className="mt-1 max-w-xl text-sm text-muted">{v.note}</div>}
            <div className="mt-2 flex gap-1.5">
              {v.level > 0 ? <Badge tone="indigo">N{v.level}</Badge> : <Badge tone="warn">Từ thêm</Badge>}
              {v.pos.slice(0, 2).map((p) => (
                <Badge key={p}>{POS_VI[p] ?? p}</Badge>
              ))}
            </div>
          </div>

          {v.ex && (
            <div className="mt-6 flex items-start gap-3 rounded-xl bg-paper p-4">
              <AudioButton size="sm" onPlay={() => playExample(v)} title="Nghe câu ví dụ (E)" />
              <div>
                <Furigana segs={v.exFuri.length ? v.exFuri : [{ t: v.ex }]} className="text-lg leading-loose" />
                <div className="text-sm text-muted">{v.exVi}</div>
              </div>
            </div>
          )}

          {!!view.kanji?.length && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {view.kanji.map((k) => (
                <div key={k.char} className="flex items-start gap-3 rounded-xl border border-line p-3">
                  <div className="jp text-3xl leading-none">{k.char}</div>
                  <div className="min-w-0 text-sm">
                    <div>
                      <span className="font-semibold tracking-wide text-accent">{k.hv}</span>
                      <span className="text-muted"> · {k.vi}</span>
                    </div>
                    {k.mn && <div className="mt-0.5 text-xs text-muted">{k.mn}</div>}
                    <div className="jp mt-1 text-xs text-muted">
                      {k.on.slice(0, 3).join('、')}
                      {k.kun.length ? ` ／ ${k.kun.slice(0, 3).join('、')}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!!view.related?.length && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-muted">Từ đã học cùng kanji:</span>
              {view.related.map((r) => (
                <span key={r.id} className={cx('rounded-lg bg-paper px-2 py-1')}>
                  <span className="jp">{r.word}</span> <span className="text-xs text-muted">{r.vi}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const POS_VI: Record<string, string> = {
  n: 'danh từ',
  'v1': 'động từ nhóm 2',
  'v5u': 'động từ nhóm 1',
  'v5k': 'động từ nhóm 1',
  'v5s': 'động từ nhóm 1',
  'v5t': 'động từ nhóm 1',
  'v5n': 'động từ nhóm 1',
  'v5b': 'động từ nhóm 1',
  'v5m': 'động từ nhóm 1',
  'v5r': 'động từ nhóm 1',
  'v5g': 'động từ nhóm 1',
  'v5k-s': 'động từ nhóm 1',
  'v5r-i': 'động từ nhóm 1',
  'v5aru': 'động từ nhóm 1',
  vs: 'danh động từ (する)',
  'vs-i': 'động từ する',
  vk: 'động từ 来る',
  vi: 'tự động từ',
  vt: 'tha động từ',
  'adj-i': 'tính từ い',
  'adj-na': 'tính từ な',
  'adj-no': 'tính từ の',
  'adj-pn': 'liên thể từ',
  adv: 'phó từ',
  'adv-to': 'phó từ (と)',
  exp: 'cụm từ',
  int: 'thán từ',
  conj: 'liên từ',
  pn: 'đại từ',
  ctr: 'trợ số từ',
  suf: 'hậu tố',
  pref: 'tiền tố',
  prt: 'trợ từ',
  num: 'số từ',
  'n-suf': 'hậu tố danh từ',
  'n-adv': 'danh từ phó từ',
  'n-t': 'danh từ thời gian',
  aux: 'trợ động từ',
  'aux-v': 'trợ động từ'
}
