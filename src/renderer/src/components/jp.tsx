import { cx } from './ui'

export interface Seg {
  t: string
  r?: string
}

/** Chữ Nhật có furigana (ruby). */
export function Furigana({ segs, show = true, className }: { segs: Seg[]; show?: boolean; className?: string }) {
  return (
    <span className={cx('jp', className)}>
      {segs.map((s, i) =>
        s.r && show ? (
          <ruby key={i}>
            {s.t}
            <rt>{s.r}</rt>
          </ruby>
        ) : (
          <span key={i}>{s.t}</span>
        )
      )}
    </span>
  )
}

/** Tách kana thành mora (ゃゅょ… ghép vào mora trước). */
export function toMorae(kana: string): string[] {
  const out: string[] = []
  for (const ch of kana) {
    if (/[ゃゅょぁぃぅぇぉャュョァィゥェォヮゎ]/.test(ch) && out.length) out[out.length - 1] += ch
    else out.push(ch)
  }
  return out
}

/**
 * Hiển thị pitch accent kiểu từ điển: gạch trên = cao, móc xuống = điểm rơi.
 * accent: 0 = 平板 (heiban), 1 = 頭高, n = rơi sau mora n.
 */
export function PitchAccent({ reading, accent, className }: { reading: string; accent: number | null | undefined; className?: string }) {
  if (accent == null) return <span className={cx('jp', className)}>{reading}</span>
  const m = toMorae(reading)
  const high = (i: number) => (accent === 0 ? i > 0 : accent === 1 ? i === 0 : i > 0 && i < accent)
  const name = accent === 0 ? '平板' : accent === 1 ? '頭高' : accent === m.length ? '尾高' : '中高'
  return (
    <span className={cx('jp inline-flex items-center gap-2', className)} title={`Pitch accent: ${name} [${accent}]`}>
      <span className="inline-flex">
        {m.map((mo, i) => (
          <span
            key={i}
            className={cx(
              'relative px-[1px] pt-1',
              high(i) && 'border-t-2 border-accent',
              high(i) && accent !== 0 && i === (accent === 1 ? 0 : accent - 1) && 'border-r-2'
            )}
          >
            {mo}
          </span>
        ))}
      </span>
      <span className="text-[10px] text-muted">{name}</span>
    </span>
  )
}
