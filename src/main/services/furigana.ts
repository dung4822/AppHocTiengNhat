import path from 'node:path'
import kuromoji from 'kuromoji'
import { ROOT } from './paths'

/** Một đoạn chữ; r = furigana (chỉ có khi đoạn chứa kanji). */
export interface Seg {
  t: string
  r?: string
}

/** Một token đã tách từ, dùng cho chế độ đọc (bấm vào từ để tra). */
export interface Tok {
  s: string // surface
  b: string // dạng từ điển
  r: string // cách đọc hiragana của surface
  p: string // từ loại
  f: Seg[] // furigana
}

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null

export function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji
        .builder({ dicPath: path.join(ROOT, 'node_modules', 'kuromoji', 'dict') })
        .build((err, t) => (err ? reject(err) : resolve(t)))
    })
  }
  return tokenizerPromise
}

export const kataToHira = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

const isKana = (c: string) => /[぀-ゟ゠-ヿー]/.test(c)
export const hasKanji = (s: string) => /[㐀-鿿々〆ヶ]/.test(s)

/**
 * Tách okurigana: 食べる + たべる -> [{t:'食',r:'た'},{t:'べる'}].
 * Dựng regex từ phần kana của surface để khớp với reading.
 */
export function furiganaSegments(surface: string, reading: string): Seg[] {
  const hiraReading = kataToHira(reading)
  if (!hasKanji(surface)) return [{ t: surface }]
  const parts: { t: string; kana: boolean }[] = []
  for (const ch of surface) {
    const k = isKana(ch) || !hasKanji(ch)
    const last = parts[parts.length - 1]
    if (last && last.kana === k) last.t += ch
    else parts.push({ t: ch, kana: k })
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    '^' + parts.map((p) => (p.kana ? `(${esc(kataToHira(p.t))})` : '(.+?)')).join('') + '$'
  )
  const m = hiraReading.match(re)
  if (!m) return [{ t: surface, r: hiraReading }]
  return parts.map((p, i) => (p.kana ? { t: p.t } : { t: p.t, r: m[i + 1] }))
}

export async function tokenize(text: string): Promise<Tok[]> {
  const t = await getTokenizer()
  return t.tokenize(text).map((x) => {
    const reading = x.reading && x.reading !== '*' ? kataToHira(x.reading) : x.surface_form
    return {
      s: x.surface_form,
      b: x.basic_form && x.basic_form !== '*' ? x.basic_form : x.surface_form,
      r: reading,
      p: x.pos,
      f: furiganaSegments(x.surface_form, reading)
    }
  })
}

/** Furigana cho cả câu (gộp các token). */
export async function sentenceFurigana(text: string): Promise<Seg[]> {
  const toks = await tokenize(text)
  const out: Seg[] = []
  for (const tk of toks) {
    for (const s of tk.f) {
      const last = out[out.length - 1]
      if (!s.r && last && !last.r) last.t += s.t
      else out.push({ ...s })
    }
  }
  return out
}
