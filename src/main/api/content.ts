/**
 * Nội dung "input" do AI tạo theo trình độ người học (i+1):
 *  - Bài đọc: chỉ dùng từ đã học + vài từ mục tiêu sắp học.
 *  - Bài nghe: hội thoại 2 người / độc thoại, đọc bằng AivisSpeech.
 * Từ trong bài được tách bằng kuromoji để bấm tra nghĩa, tô màu theo mức độ đã biết.
 */
import { getDb } from '../db'
import { chatJSON, configFromEnv } from '../services/deepseek'
import { type Tok, tokenize } from '../services/furigana'
import { VOICES } from '../services/tts'
import { getSettings } from '../settings'
import { ensureAudio, getKanjiMany, parseJSON, parseVocab } from './common'
import { srsApi } from './srs'

export interface Sentence {
  jp: string
  vi: string
  sp?: 'A' | 'B'
  toks: Tok[]
}
export interface Question {
  q: string
  choices: string[]
  answer: number
  explain: string
}
export interface PassageData {
  title: string
  titleVi: string
  topic: string
  level: number
  sentences: Sentence[]
  questions: Question[]
  targets: string[]
}

const TOPICS = [
  'đi chợ, mua sắm', 'nấu ăn ở nhà', 'đi làm buổi sáng', 'cuối tuần với bạn bè', 'đi du lịch Kyoto', 'thời tiết và mùa',
  'gia đình', 'sở thích', 'trường học', 'đi bệnh viện', 'thuê nhà', 'tàu điện', 'nhà hàng', 'thư viện', 'thể thao',
  'phỏng vấn xin việc', 'gọi điện thoại', 'sinh nhật', 'lễ hội mùa hè', 'đồ điện tử', 'sức khoẻ', 'công việc làm thêm',
  'gửi bưu điện', 'hỏi đường', 'đặt khách sạn', 'tin tức địa phương', 'kế hoạch tương lai', 'kỷ niệm tuổi thơ',
  'bảo vệ môi trường', 'mạng xã hội', 'ngân hàng', 'cửa hàng tiện lợi', 'phim ảnh', 'âm nhạc', 'thú cưng', 'dọn nhà'
]

/** Hồ sơ trình độ hiện tại: từ đã biết, từ mục tiêu, cấp độ phù hợp. */
export function learnerProfile() {
  const db = getDb()
  const known = (
    db
      .prepare(
        `SELECT v.word FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0
         WHERE c.state IN (1,2,3) ORDER BY c.last_review DESC LIMIT 900`
      )
      .all() as { word: string }[]
  ).map((r) => r.word)
  const targets = (
    db
      .prepare(
        `SELECT v.word, MIN(c.position) p FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0
         WHERE c.state = 0 AND c.queue = 0 AND v.word NOT IN (SELECT v2.word FROM vocab v2 JOIN cards c2 ON c2.deck='vocab' AND c2.note_id=v2.id AND c2.ord=0 WHERE c2.state != 0)
         GROUP BY v.word ORDER BY p LIMIT 5`
      )
      .all() as { word: string }[]
  ).map((r) => r.word)
  const lv = db
    .prepare(
      `SELECT v.level, COUNT(*) total, SUM(CASE WHEN c.state = 2 THEN 1 ELSE 0 END) known FROM vocab v
       JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0 WHERE v.custom = 0 GROUP BY v.level`
    )
    .all() as { level: number; total: number; known: number }[]
  const pct = (l: number) => {
    const r = lv.find((x) => x.level === l)
    return r ? r.known / r.total : 0
  }
  const level = pct(5) < 0.7 ? 5 : pct(4) < 0.7 ? 4 : 3
  const grammar = (
    db
      .prepare(`SELECT g.pattern FROM grammar g JOIN cards c ON c.deck='grammar' AND c.note_id=g.id WHERE c.state != 0 LIMIT 300`)
      .all() as { pattern: string }[]
  ).map((r) => r.pattern)
  return { known, targets, level, knownCount: known.length, grammar }
}

const READING_SYSTEM = `Bạn là tác giả bài đọc tiếng Nhật cho người Việt học JLPT. Viết bài đọc trình độ {LEVEL}.
QUY TẮC TỪ VỰNG (quan trọng nhất):
- Ưu tiên tuyệt đối các từ trong danh sách "đã biết". Dùng MỖI "từ mục tiêu" ít nhất 1 lần.
- Từ ngoài danh sách chỉ được dùng nếu cực kỳ cơ bản (trợ từ, số, đại từ, です/ます, ある/いる, する).
- Người học mới biết {COUNT} từ: nếu ít từ, viết rất đơn giản, câu ngắn, lặp lại từ.
- Ngữ pháp ≤ {LEVEL}{GRAMMAR}.
Bài viết tự nhiên như người Nhật viết, có nội dung thú vị, liền mạch. Viết kanji bình thường (app tự thêm furigana).
Trả JSON: {"title": "tiêu đề tiếng Nhật", "titleVi": "...", "sentences": [{"jp": "1 câu", "vi": "dịch tự nhiên"}],
"questions": [{"q": "câu hỏi đọc hiểu bằng tiếng Nhật", "choices": ["4 lựa chọn tiếng Nhật"], "answer": 0, "explain": "giải thích ngắn tiếng Việt"}]}
Tạo {QN} câu hỏi kiểu đề JLPT 読解.`

const LISTENING_SYSTEM = `Bạn là người viết kịch bản bài nghe tiếng Nhật cho người Việt luyện JLPT 聴解, trình độ {LEVEL}.
{KIND}
QUY TẮC TỪ VỰNG: ưu tiên tuyệt đối các từ "đã biết", dùng MỖI "từ mục tiêu" ít nhất 1 lần; ngoài ra chỉ dùng từ cực kỳ cơ bản.
Người học mới biết {COUNT} từ: nếu ít từ thì câu rất ngắn, đơn giản. Văn nói tự nhiên (có あのう、えっと、そうですね khi hợp lý).
Trả JSON: {"title": "tiêu đề tiếng Nhật", "titleVi": "...", "lines": [{"sp": "A" hoặc "B", "jp": "câu thoại", "vi": "dịch"}],
"questions": [{"q": "câu hỏi tiếng Nhật kiểu đề 聴解", "choices": ["4 lựa chọn tiếng Nhật ngắn"], "answer": 0, "explain": "giải thích tiếng Việt"}]}
A là nữ, B là nam. Tạo {QN} câu hỏi.`

async function processSentences(raw: { jp: string; vi: string; sp?: 'A' | 'B' }[]): Promise<Sentence[]> {
  const out: Sentence[] = []
  for (const s of raw) if (s?.jp) out.push({ jp: s.jp, vi: s.vi ?? '', ...(s.sp ? { sp: s.sp } : {}), toks: await tokenize(s.jp) })
  return out
}

function savePassage(kind: 'reading' | 'listening', data: PassageData): number {
  const r = getDb()
    .prepare('INSERT INTO passages(kind, title, level, data, created) VALUES(?, ?, ?, ?, ?)')
    .run(kind, data.title, data.level, JSON.stringify(data), Date.now())
  return Number(r.lastInsertRowid)
}

function lineSpeaker(sp?: 'A' | 'B') {
  const s = getSettings()
  return sp === 'B' ? s.speaker2 ?? VOICES.male : s.speaker ?? VOICES.female
}

/** Sinh trước audio cho bài nghe (chạy nền). */
async function pregenAudio(sentences: Sentence[]) {
  for (const s of sentences) await ensureAudio(s.jp, { speaker: lineSpeaker(s.sp) })
}

// --------------------------------------------------------------- Trạng thái từ trong bài

interface WordIndex {
  byWord: Map<string, { id: number; state: number }>
  byReading: Map<string, { id: number; state: number }>
}
function wordIndex(): WordIndex {
  const rows = getDb()
    .prepare(
      `SELECT v.id, v.word, v.reading, c.state FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0`
    )
    .all() as { id: number; word: string; reading: string; state: number }[]
  const byWord = new Map<string, { id: number; state: number }>()
  const byReading = new Map<string, { id: number; state: number }>()
  for (const r of rows) {
    if (!byWord.has(r.word)) byWord.set(r.word, { id: r.id, state: r.state })
    if (!byReading.has(r.reading)) byReading.set(r.reading, { id: r.id, state: r.state })
  }
  return { byWord, byReading }
}

const SKIP_POS = new Set(['助詞', '記号', '助動詞', 'フィラー', '感動詞'])
const isKanaOnly = (s: string) => /^[぀-ゟ゠-ヿーー]+$/.test(s)

export type TokStatus = 'skip' | 'known' | 'learning' | 'new' | 'unknown'

function annotate(data: PassageData, idx: WordIndex) {
  let content = 0
  let known = 0
  const sentences = data.sentences.map((s) => ({
    ...s,
    toks: s.toks.map((t) => {
      let status: TokStatus = 'unknown'
      let vocabId: number | null = null
      if (SKIP_POS.has(t.p) || /^[\s、。！？「」『』（）・…ー!?.,0-9０-９]+$/.test(t.s)) status = 'skip'
      else {
        const hit = idx.byWord.get(t.b) ?? idx.byWord.get(t.s) ?? (isKanaOnly(t.b) ? idx.byReading.get(t.b) : undefined)
        if (hit) {
          vocabId = hit.id
          status = hit.state === 2 ? 'known' : hit.state === 0 ? 'new' : 'learning'
        } else if (isKanaOnly(t.s) && t.s.length <= 2) status = 'skip'
      }
      if (status !== 'skip') {
        content++
        if (status === 'known' || status === 'learning') known++
      }
      return { ...t, status, vocabId }
    })
  }))
  return { ...data, sentences, coverage: content ? known / content : 1 }
}

// --------------------------------------------------------------- API

export const contentApi = {
  'content.profile'() {
    const p = learnerProfile()
    return { level: p.level, knownCount: p.knownCount, targets: p.targets }
  },

  async 'reading.generate'(opts: { topic?: string; length?: 'short' | 'medium' | 'long' }) {
    const p = learnerProfile()
    const topic = opts.topic?.trim() || TOPICS[Math.floor(Math.random() * TOPICS.length)]
    const len = opts.length ?? 'medium'
    const chars = { short: 150, medium: 300, long: 500 }[len] * (p.level === 5 ? 0.7 : p.level === 4 ? 0.9 : 1.1)
    const res = await chatJSON<any>(configFromEnv(), {
      system: READING_SYSTEM.replace(/\{LEVEL\}/g, `N${p.level}`)
        .replace('{COUNT}', String(p.knownCount))
        .replace('{QN}', len === 'short' ? '2' : '3')
        .replace('{GRAMMAR}', p.grammar.length ? ` (đã học: ${p.grammar.slice(0, 80).join('、')})` : ''),
      user: `Chủ đề: ${topic}. Độ dài khoảng ${Math.round(chars)} ký tự.\nTừ mục tiêu: ${p.targets.join('、') || '(không có)'}\nTừ đã biết: ${p.known.join('、') || '(chưa có — dùng từ N5 cơ bản nhất)'}`,
      temperature: 0.9,
      maxTokens: 4000
    })
    const data: PassageData = {
      title: res.title ?? topic,
      titleVi: res.titleVi ?? topic,
      topic,
      level: p.level,
      sentences: await processSentences(res.sentences ?? []),
      questions: (res.questions ?? []).filter((q: any) => q?.choices?.length >= 2),
      targets: p.targets
    }
    return savePassage('reading', data)
  },

  async 'listening.generate'(opts: { topic?: string; kind?: 'dialogue' | 'monologue' }) {
    const p = learnerProfile()
    const topic = opts.topic?.trim() || TOPICS[Math.floor(Math.random() * TOPICS.length)]
    const kind = opts.kind ?? 'dialogue'
    const lines = p.level === 5 ? '6–10' : p.level === 4 ? '8–12' : '10–16'
    const res = await chatJSON<any>(configFromEnv(), {
      system: LISTENING_SYSTEM.replace(/\{LEVEL\}/g, `N${p.level}`)
        .replace('{COUNT}', String(p.knownCount))
        .replace('{QN}', '2')
        .replace(
          '{KIND}',
          kind === 'dialogue'
            ? `Viết hội thoại giữa A và B, ${lines} lượt thoại.`
            : `Viết độc thoại/thông báo của 1 người (sp luôn là "A"), ${lines} câu.`
        ),
      user: `Chủ đề: ${topic}.\nTừ mục tiêu: ${p.targets.join('、') || '(không có)'}\nTừ đã biết: ${p.known.join('、') || '(chưa có — dùng từ N5 cơ bản nhất)'}`,
      temperature: 0.9,
      maxTokens: 4000
    })
    const sentences = await processSentences(
      (res.lines ?? []).map((l: any) => ({ jp: l.jp, vi: l.vi, sp: l.sp === 'B' ? 'B' : 'A' }))
    )
    const data: PassageData = {
      title: res.title ?? topic,
      titleVi: res.titleVi ?? topic,
      topic,
      level: p.level,
      sentences,
      questions: (res.questions ?? []).filter((q: any) => q?.choices?.length >= 2),
      targets: p.targets
    }
    const id = savePassage('listening', data)
    void pregenAudio(sentences)
    return id
  },

  'passage.list'(kind: 'reading' | 'listening') {
    return getDb()
      .prepare('SELECT id, title, level, created, done_count, last_opened, data FROM passages WHERE kind = ? ORDER BY created DESC LIMIT 200')
      .all(kind)
      .map((r: any) => {
        const d = parseJSON<PassageData | null>(r.data, null)
        return { id: r.id, title: r.title, titleVi: d?.titleVi ?? '', topic: d?.topic ?? '', level: r.level, created: r.created, doneCount: r.done_count, lines: d?.sentences.length ?? 0 }
      })
  },

  'passage.get'(id: number) {
    const db = getDb()
    const r = db.prepare('SELECT * FROM passages WHERE id = ?').get(id) as any
    if (!r) return null
    db.prepare('UPDATE passages SET last_opened = ? WHERE id = ?').run(Date.now(), id)
    const data = parseJSON<PassageData>(r.data, null as any)
    return { id: r.id, kind: r.kind as 'reading' | 'listening', doneCount: r.done_count as number, ...annotate(data, wordIndex()) }
  },

  'passage.done'(id: number) {
    getDb().prepare('UPDATE passages SET done_count = done_count + 1 WHERE id = ?').run(id)
  },

  'passage.delete'(id: number) {
    getDb().prepare('DELETE FROM passages WHERE id = ?').run(id)
  },

  /** Audio cho một câu (giọng theo vai A/B). */
  'passage.audio'(text: string, sp?: 'A' | 'B') {
    return ensureAudio(text, { speaker: lineSpeaker(sp) })
  },

  /** Tra một từ trong bài: từ có trong kho học (kèm trạng thái) hoặc từ điển JMdict. */
  'word.lookup'(base: string, surface: string) {
    const db = getDb()
    const v = (db
      .prepare(
        `SELECT v.*, c.state, c.id card_id FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0
         WHERE v.word = ? OR v.word = ? OR (v.reading = ? AND v.word = v.reading) LIMIT 1`
      )
      .get(base, surface, base) ?? null) as any
    if (v) {
      const note = parseVocab(v)
      return { vocab: note, state: v.state as number, kanji: getKanjiMany(note.kanji), dict: [] as any[] }
    }
    const dict = db
      .prepare('SELECT word, reading, en FROM dict WHERE word = ? OR word = ? OR reading = ? ORDER BY common DESC LIMIT 3')
      .all(base, surface, base) as { word: string; reading: string; en: string }[]
    return { vocab: null, state: -1, kanji: [], dict }
  },

  /** Thêm từ vào hàng đợi học ngay. Nếu từ chưa có trong kho, AI tạo thẻ mới (nghĩa + ví dụ). */
  async 'word.add'(word: string, reading: string) {
    const db = getDb()
    const exist = db.prepare('SELECT id FROM vocab WHERE word = ? AND reading = ?').get(word, reading) as any
    if (exist) {
      srsApi['srs.learnNow']('vocab', exist.id)
      return exist.id as number
    }
    const dict = db.prepare('SELECT en FROM dict WHERE word = ? AND reading = ? LIMIT 1').get(word, reading) as any
    const info = await chatJSON<{ vi: string; note: string; ex: string; exVi: string }>(configFromEnv(), {
      system:
        'Soạn thẻ từ vựng tiếng Nhật cho người Việt. Trả JSON {"vi": nghĩa ngắn ≤10 từ, "note": ghi chú ≤15 từ hoặc "", "ex": 1 câu ví dụ tự nhiên ngắn, "exVi": dịch}.',
      user: JSON.stringify({ word, reading, en: dict?.en ?? '' }),
      temperature: 0.4,
      maxTokens: 400
    })
    const { furiganaSegments, sentenceFurigana } = await import('../services/furigana')
    const kanji = [...new Set([...word].filter((c) => /[㐀-鿿]/.test(c)))]
    const r = db
      .prepare(
        `INSERT INTO vocab(key, word, reading, level, rank, vi, note, en, pos, pitch, kanji, furi, ex, ex_vi, ex_furi, audio, ex_audio, custom)
         VALUES(?, ?, ?, 0, 0, ?, ?, ?, '[]', 'null', ?, ?, ?, ?, ?, '', '', 1)`
      )
      .run(
        `custom:${word}|${reading}`, word, reading, info.vi, info.note ?? '',
        JSON.stringify(dict?.en ? [dict.en] : []), JSON.stringify(kanji),
        JSON.stringify(furiganaSegments(word, reading)), info.ex ?? '', info.exVi ?? '',
        JSON.stringify(info.ex ? await sentenceFurigana(info.ex) : [])
      )
    const id = Number(r.lastInsertRowid)
    db.prepare(`INSERT OR IGNORE INTO cards(deck, note_id, ord, position) VALUES('vocab', ?, 0, 0), ('vocab', ?, 1, 1)`).run(id, id)
    srsApi['srs.learnNow']('vocab', id)
    return id
  },

  /** Dịch nhanh một câu/từ bằng AI (có cache). */
  async 'ai.explain'(text: string, context?: string) {
    const db = getDb()
    const key = `explain:${text}|${context ?? ''}`
    const c = db.prepare('SELECT value FROM ai_cache WHERE key = ?').get(key) as any
    if (c) return c.value as string
    const { chat } = await import('../services/deepseek')
    const out = await chat(configFromEnv(), {
      system:
        'Bạn là giáo viên tiếng Nhật cho người Việt. Giải thích NGẮN GỌN (≤ 120 từ) bằng tiếng Việt: nghĩa, cách đọc, ngữ pháp/cấu trúc quan trọng, lỗi hay gặp. Dùng gạch đầu dòng.',
      user: context ? `Câu: ${context}\nCần giải thích: ${text}` : text,
      temperature: 0.3,
      maxTokens: 500
    })
    db.prepare('INSERT OR REPLACE INTO ai_cache(key, value, created) VALUES(?, ?, ?)').run(key, out, Date.now())
    return out
  }
}
