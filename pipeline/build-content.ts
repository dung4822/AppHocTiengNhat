/**
 * Bước 5: gộp dữ liệu nền + kết quả DeepSeek thành nội dung cuối (có furigana, tên file audio).
 * Kết quả: data/content/vocab.json, kanji.json, grammar.json, manifest.json
 * App đọc các file này khi khởi động và cập nhật vào SQLite (không đụng tiến độ học).
 */
import { furiganaSegments, sentenceFurigana, type Seg } from '../src/main/services/furigana'
import { audioRelPath } from '../src/main/services/tts'
import type { BaseKanji, BaseVocab } from './base'
import type { KanjiInfo } from './enrich-kanji'
import type { VocabInfo } from './enrich-vocab'
import type { GrammarPoint } from './grammar'
import { GRAMMAR_LIST } from './grammar-list'
import { JsonlCache, readContent, writeContent } from './lib'

export interface ContentVocab {
  key: string
  word: string
  reading: string
  level: number
  rank: number
  vi: string
  note: string
  en: string[]
  pos: string[]
  pitch: number[] | null
  kanji: string[]
  furi: Seg[]
  ex: string
  exVi: string
  exFuri: Seg[]
  audio: string
  exAudio: string
}

export interface ContentKanji {
  char: string
  hv: string
  vi: string
  mn: string
  en: string[]
  on: string[]
  kun: string[]
  strokes: number
  level: number
}

export interface ContentGrammar extends GrammarPoint {
  rank: number
  examples: { jp: string; ans: string; vi: string; furi: Seg[]; audio: string }[]
}

/**
 * Furigana cho câu ví dụ, đảm bảo từ đích luôn đúng cách đọc (kuromoji đôi khi đọc sai chữ đơn, VD 雨→う).
 * Tách câu thành: trước | từ đích (hoặc gốc từ nếu đã chia) | sau.
 */
async function exampleFurigana(ex: string, word: string, reading: string): Promise<Seg[]> {
  const tail = word.match(/[぀-ゟ]+$/)?.[0] ?? ''
  const cands: [string, string][] = [[word, reading]]
  if (tail && reading.endsWith(tail) && tail.length < word.length) cands.push([word.slice(0, -tail.length), reading.slice(0, -tail.length)])
  for (const [w, r] of cands) {
    const i = ex.indexOf(w)
    if (i < 0 || !/[㐀-鿿]/.test(w)) continue
    const before = i > 0 ? await sentenceFurigana(ex.slice(0, i)) : []
    const after = i + w.length < ex.length ? await sentenceFurigana(ex.slice(i + w.length)) : []
    return [...before, ...furiganaSegments(w, r), ...after]
  }
  return sentenceFurigana(ex)
}

async function main() {
  const baseV = readContent<BaseVocab[]>('base-vocab.json')
  const baseK = readContent<BaseKanji[]>('base-kanji.json')
  const vCache = new JsonlCache<VocabInfo>('vocab')
  const kCache = new JsonlCache<KanjiInfo>('kanji')
  const gCache = new JsonlCache<Omit<GrammarPoint, 'key' | 'level' | 'pattern'>>('grammar2')

  const vocab: ContentVocab[] = []
  for (const b of baseV) {
    const info = vCache.get(b.key)
    if (!info) continue
    // Đọc từ bằng kana để TTS không đọc nhầm âm (VD 上: うえ/かみ), pitch accent lấy từ Kanjium
    const accent = b.pitch?.[0] ?? null
    vocab.push({
      key: b.key,
      word: b.word,
      reading: b.reading,
      level: b.level,
      rank: b.rank,
      vi: info.vi,
      note: info.note,
      en: b.en,
      pos: b.pos,
      pitch: b.pitch,
      kanji: b.kanji,
      furi: furiganaSegments(b.word, b.reading),
      ex: info.ex,
      exVi: info.exVi,
      exFuri: info.ex ? await exampleFurigana(info.ex, b.word, b.reading) : [],
      audio: audioRelPath(b.reading, undefined, accent),
      exAudio: info.ex ? audioRelPath(info.ex) : ''
    })
  }

  const kanji: ContentKanji[] = baseK.map((k) => {
    const info = kCache.get(k.char)
    return {
      char: k.char,
      hv: info?.hv ?? k.hvCandidates[0]?.toUpperCase() ?? '',
      vi: info?.vi ?? k.en[0] ?? '',
      mn: info?.mn ?? '',
      en: k.en,
      on: k.on,
      kun: k.kun,
      strokes: k.strokes,
      level: k.level
    }
  })

  const grammar: ContentGrammar[] = []
  for (const lv of [5, 4, 3]) {
    let rank = 0
    for (const pattern of GRAMMAR_LIST[lv]) {
      const key = `N${lv}:${pattern}`
      const d = gCache.get(key)
      if (!d) continue
      rank++
      const examples = []
      for (const e of d.examples) examples.push({ ...e, furi: await sentenceFurigana(e.jp), audio: audioRelPath(e.jp) })
      grammar.push({ key, level: lv, pattern, rank, meaning: d.meaning, structure: d.structure, explain: d.explain, examples })
    }
  }

  writeContent('vocab.json', vocab)
  writeContent('kanji.json', kanji)
  writeContent('grammar.json', grammar)
  writeContent('manifest.json', { version: Date.now(), vocab: vocab.length, kanji: kanji.length, grammar: grammar.length })
  console.log(`vocab ${vocab.length}, kanji ${kanji.length}, grammar ${grammar.length}`)
}

main()
