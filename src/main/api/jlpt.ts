/**
 * Luyện đề JLPT theo đúng dạng câu hỏi trong đề thi, sinh từ chính những từ/ngữ pháp đã học:
 *  - 漢字読み (đọc kanji), 表記 (chọn chữ kanji), 文脈規定 (điền từ theo ngữ cảnh), 文法形式 (ngữ pháp)
 *    → sinh tự động, không tốn API.
 *  - 言い換え類義 (từ đồng nghĩa), 用法 (cách dùng) → DeepSeek tạo theo lô.
 *  - Nghe nhanh: nghe câu/từ → chọn nghĩa.
 */
import { getDb } from '../db'
import { chatJSON, configFromEnv } from '../services/deepseek'
import { kataToHira } from '../services/furigana'
import { today } from '../scheduler'
import { getSettings } from '../settings'
import { type VocabNote, parseJSON, parseVocab } from './common'
import { learnerProfile } from './content'

export type QType = 'kanjiReading' | 'orthography' | 'context' | 'grammar' | 'paraphrase' | 'usage' | 'listenWord' | 'listenSentence'

export interface JQuestion {
  type: QType
  /** Câu hỏi; phần cần chú ý được đánh dấu bằng [[...]] (gạch chân) hoặc （　） (chỗ trống) */
  prompt: string
  choices: string[]
  answer: number
  explain: string
  audio?: { text: string; accent?: number | null }
  vocabId?: number
}

const shuffle = <T>(a: T[]): T[] => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

function finalize(q: Omit<JQuestion, 'choices' | 'answer'>, correct: string, wrong: string[]): JQuestion | null {
  const uniq = [...new Set(wrong.filter((w) => w && w !== correct))].slice(0, 3)
  if (uniq.length < 3) return null
  const choices = shuffle([correct, ...uniq])
  return { ...q, choices, answer: choices.indexOf(correct) }
}

/** Từ đã học (đã ôn ít nhất 1 lần), ưu tiên từ đã thuộc. */
function learnedWords(): VocabNote[] {
  const rows = getDb()
    .prepare(
      `SELECT v.* FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0
       WHERE c.state != 0 ORDER BY RANDOM() LIMIT 400`
    )
    .all()
  return rows.map(parseVocab)
}

function poolWords(level: number): VocabNote[] {
  return getDb().prepare('SELECT * FROM vocab WHERE level >= ? ORDER BY RANDOM() LIMIT 600').all(level).map(parseVocab)
}

// ------------------------------------------------------------ biến thể cách đọc (gây nhiễu)

const DAKUTEN: Record<string, string[]> = {
  か: ['が'], が: ['か'], き: ['ぎ'], ぎ: ['き'], く: ['ぐ'], ぐ: ['く'], け: ['げ'], げ: ['け'], こ: ['ご'], ご: ['こ'],
  さ: ['ざ'], ざ: ['さ'], し: ['じ'], じ: ['し'], す: ['ず'], ず: ['す'], せ: ['ぜ'], ぜ: ['せ'], そ: ['ぞ'], ぞ: ['そ'],
  た: ['だ'], だ: ['た'], て: ['で'], で: ['て'], と: ['ど'], ど: ['と'], ち: ['ぢ'], つ: ['づ'],
  は: ['ば', 'ぱ'], ば: ['は', 'ぱ'], ぱ: ['は', 'ば'], ひ: ['び', 'ぴ'], び: ['ひ', 'ぴ'], ふ: ['ぶ', 'ぷ'], ぶ: ['ふ', 'ぷ'],
  へ: ['べ', 'ぺ'], べ: ['へ', 'ぺ'], ほ: ['ぼ', 'ぽ'], ぼ: ['ほ', 'ぽ']
}

function readingVariants(reading: string): string[] {
  const r = kataToHira(reading)
  const out = new Set<string>()
  // trường âm
  out.add(r.replace(/([おこそとのほもよろごぞどぼぽょ])う/, '$1'))
  out.add(r.replace(/([こそとほよごぞどぼょ])(?!う)/, '$1う'))
  out.add(r.replace(/([えけせてねへめれげぜでべぺ])い/, '$1'))
  out.add(r.replace(/ゅう/, 'ゅ'))
  out.add(r.replace(/ゅ(?!う)/, 'ゅう'))
  out.add(r.replace(/ょ/, 'よ'))
  out.add(r.replace(/ゃ/, 'や'))
  // âm ngắt
  out.add(r.replace(/っ/, ''))
  out.add(r.replace(/([かきくけこさしすせそたちつてとぱぴぷぺぽ])/, (m, c, i) => (i > 0 ? 'っ' + c : c)))
  // biến âm đục/trong
  for (let i = 0; i < r.length; i++) {
    const alts = DAKUTEN[r[i]]
    if (alts) for (const a of alts) out.add(r.slice(0, i) + a + r.slice(i + 1))
  }
  out.delete(r)
  return shuffle([...out].filter((x) => x.length > 0))
}

function onReadingSwaps(v: VocabNote): string[] {
  // Thay cách đọc 1 chữ kanji bằng âm On khác của chính chữ đó
  const db = getDb()
  const out: string[] = []
  v.furi.forEach((seg, i) => {
    if (!seg.r || seg.t.length !== 1) return
    const k = db.prepare('SELECT on_r, kun_r FROM kanji WHERE char = ?').get(seg.t) as any
    if (!k) return
    const alts = [...parseJSON<string[]>(k.on_r, []).map(kataToHira), ...parseJSON<string[]>(k.kun_r, []).map((x) => x.split('.')[0].replace('-', ''))]
    for (const a of alts) {
      if (a && a !== seg.r) out.push(v.furi.map((s, j) => (j === i ? a : s.r ?? s.t)).join(''))
    }
  })
  return shuffle(out)
}

function markInSentence(ex: string, word: string, display: string): string | null {
  if (!ex.includes(word)) return null
  return ex.replace(word, `[[${display}]]`)
}

// ------------------------------------------------------------ các dạng câu hỏi

function qKanjiReading(v: VocabNote, pool: VocabNote[]): JQuestion | null {
  if (!v.kanji.length) return null
  const prompt = markInSentence(v.ex, v.word, v.word) ?? `[[${v.word}]]`
  const sameLen = pool.filter((p) => p.reading.length === v.reading.length && p.id !== v.id).map((p) => kataToHira(p.reading))
  const wrong = [...onReadingSwaps(v), ...readingVariants(v.reading), ...shuffle(sameLen)]
  return finalize(
    { type: 'kanjiReading', prompt, explain: `${v.word}（${v.reading}）: ${v.vi}`, vocabId: v.id },
    kataToHira(v.reading),
    wrong
  )
}

function qOrthography(v: VocabNote, pool: VocabNote[]): JQuestion | null {
  if (!v.kanji.length) return null
  const prompt = markInSentence(v.ex, v.word, v.reading) ?? `[[${v.reading}]]`
  const db = getDb()
  const fakes: string[] = []
  // thay 1 chữ kanji bằng chữ khác cùng âm Hán Việt / cùng âm On (lỗi thường gặp)
  for (const k of v.kanji) {
    const info = db.prepare('SELECT hv, on_r FROM kanji WHERE char = ?').get(k) as any
    if (!info) continue
    const ons = parseJSON<string[]>(info.on_r, [])
    const sims = db
      .prepare(`SELECT char FROM kanji WHERE char != ? AND (hv = ? OR on_r LIKE ?) ORDER BY RANDOM() LIMIT 4`)
      .all(k, info.hv, ons[0] ? `%"${ons[0]}"%` : '__none__') as { char: string }[]
    for (const s of sims) fakes.push(v.word.replace(k, s.char))
  }
  const sameReading = pool.filter((p) => kataToHira(p.reading) === kataToHira(v.reading) && p.word !== v.word).map((p) => p.word)
  const sameLen = pool.filter((p) => p.word.length === v.word.length && p.kanji.length && p.id !== v.id).map((p) => p.word)
  return finalize(
    { type: 'orthography', prompt, explain: `${v.reading} → ${v.word}: ${v.vi}`, vocabId: v.id },
    v.word,
    [...sameReading, ...shuffle(fakes), ...shuffle(sameLen)]
  )
}

function qContext(v: VocabNote, pool: VocabNote[]): JQuestion | null {
  if (!v.ex.includes(v.word)) return null
  const pos = v.pos[0]
  const same = pool.filter((p) => p.id !== v.id && p.pos[0] === pos && !v.ex.includes(p.word)).map((p) => p.word)
  return finalize(
    { type: 'context', prompt: v.ex.replace(v.word, '（　　）'), explain: `${v.ex} — ${v.exVi}`, vocabId: v.id },
    v.word,
    shuffle(same)
  )
}

function qGrammar(level: number): JQuestion | null {
  const db = getDb()
  const learned = db
    .prepare(
      `SELECT g.* FROM grammar g JOIN cards c ON c.deck='grammar' AND c.note_id=g.id
       WHERE c.state != 0 OR g.level >= ? ORDER BY RANDOM() LIMIT 1`
    )
    .get(Math.max(level, 4)) as any
  if (!learned) return null
  const exs = parseJSON<{ jp: string; ans: string; vi: string }[]>(learned.examples, [])
  if (!exs.length) return null
  const ex = pick(exs)
  const others = db.prepare('SELECT examples FROM grammar WHERE id != ? AND level >= ? ORDER BY RANDOM() LIMIT 12').all(learned.id, learned.level - 1) as any[]
  const wrong = others.flatMap((o) => parseJSON<{ ans: string }[]>(o.examples, []).map((e) => e.ans)).filter((a) => a.length <= ex.ans.length + 4)
  return finalize(
    { type: 'grammar', prompt: ex.jp.replace(ex.ans, '（　　）'), explain: `${learned.pattern}: ${learned.meaning}\n${ex.jp} — ${ex.vi}` },
    ex.ans,
    shuffle(wrong)
  )
}

function qListenWord(v: VocabNote, pool: VocabNote[]): JQuestion | null {
  return finalize(
    { type: 'listenWord', prompt: 'Nghe và chọn nghĩa đúng', explain: `${v.word}（${v.reading}）: ${v.vi}`, audio: { text: v.reading, accent: v.pitch?.[0] ?? null }, vocabId: v.id },
    v.vi,
    shuffle(pool.filter((p) => p.id !== v.id).map((p) => p.vi))
  )
}

function qListenSentence(v: VocabNote, pool: VocabNote[]): JQuestion | null {
  if (!v.ex || !v.exVi) return null
  return finalize(
    { type: 'listenSentence', prompt: 'Nghe câu và chọn nghĩa đúng', explain: `${v.ex} — ${v.exVi}`, audio: { text: v.ex }, vocabId: v.id },
    v.exVi,
    shuffle(pool.filter((p) => p.id !== v.id && p.exVi).map((p) => p.exVi))
  )
}

const MAKERS: Record<string, (v: VocabNote, pool: VocabNote[]) => JQuestion | null> = {
  kanjiReading: qKanjiReading,
  orthography: qOrthography,
  context: qContext,
  listenWord: qListenWord,
  listenSentence: qListenSentence
}

export const jlptApi = {
  /** Tạo bộ câu hỏi tự động (không tốn API). */
  'jlpt.make'(types: QType[], count: number) {
    const learned = learnedWords()
    const level = learnerProfile().level
    const words = learned.length >= 10 ? learned : poolWords(level).slice(0, 100)
    const pool = [...learned, ...poolWords(level)]
    const out: JQuestion[] = []
    let guard = 0
    while (out.length < count && guard++ < count * 20) {
      const t = types[out.length % types.length]
      let q: JQuestion | null = null
      if (t === 'grammar') q = qGrammar(level)
      else if (MAKERS[t]) q = MAKERS[t](pick(words), pool)
      if (q && !out.some((o) => o.prompt === q!.prompt && o.type === q!.type)) out.push(q)
    }
    return shuffle(out)
  },

  /** 言い換え類義 + 用法 do AI tạo (≈ 0.001 USD / 10 câu). */
  async 'jlpt.makeAI'(count: number) {
    const p = learnerProfile()
    const words = shuffle(p.known).slice(0, 40)
    const res = await chatJSON<{ items: any[] }>(configFromEnv(), {
      system: `Bạn là người ra đề JLPT N${p.level}. Tạo câu hỏi phần 文字・語彙 dạng:
- "paraphrase" (言い換え類義): 1 câu tiếng Nhật có 1 từ được gạch chân, viết dạng [[từ]]; 4 lựa chọn là cụm từ/câu ngắn; đúng 1 lựa chọn đồng nghĩa nhất.
- "usage" (用法): đề bài là 1 từ; 4 lựa chọn là 4 câu dùng từ đó, chỉ 1 câu dùng đúng.
Dùng các từ người học đã biết, độ khó N${p.level}. Trả JSON {"items":[{"type":"paraphrase"|"usage","prompt":"...","choices":["","","",""],"answer":0,"explain":"giải thích tiếng Việt ngắn"}]}`,
      user: `Tạo ${count} câu (khoảng nửa mỗi dạng). Từ đã biết: ${words.join('、') || 'từ N5 cơ bản'}`,
      temperature: 0.7,
      maxTokens: 4000
    })
    return (res.items ?? [])
      .filter((q) => Array.isArray(q.choices) && q.choices.length === 4 && q.answer >= 0 && q.answer < 4)
      .map((q) => ({ type: q.type === 'usage' ? 'usage' : 'paraphrase', prompt: q.prompt, choices: q.choices, answer: q.answer, explain: q.explain ?? '' }) as JQuestion)
  },

  'jlpt.saveResult'(kind: string, total: number, correct: number, detail: unknown) {
    getDb()
      .prepare('INSERT INTO jlpt_results(ts, day, kind, total, correct, detail) VALUES(?, ?, ?, ?, ?, ?)')
      .run(Date.now(), today(), kind, total, correct, JSON.stringify(detail))
  },

  'jlpt.history'() {
    return getDb().prepare('SELECT id, ts, kind, total, correct FROM jlpt_results ORDER BY ts DESC LIMIT 100').all() as {
      id: number
      ts: number
      kind: string
      total: number
      correct: number
    }[]
  },

  'jlpt.speaker'() {
    return getSettings().speaker
  }
}
