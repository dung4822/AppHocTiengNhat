/** API ôn thẻ (dùng chung cho deck từ vựng và ngữ pháp). */
import type { Grade } from 'ts-fsrs'
import { getDb } from '../db'
import {
  type CardRow,
  type Deck,
  answerCard,
  deckCounts,
  nextCard,
  previewIntervals,
  retrievability,
  undoLast
} from '../scheduler'
import { type KanjiInfo, type VocabNote, getKanjiMany, getVocab, parseJSON } from './common'

export interface GrammarNote {
  id: number
  key: string
  level: number
  rank: number
  pattern: string
  meaning: string
  structure: string
  explain: string
  examples: { jp: string; ans: string; vi: string; furi: { t: string; r?: string }[]; audio: string }[]
}

export function parseGrammar(r: any): GrammarNote {
  return { ...r, examples: parseJSON(r.examples, []) }
}

export interface RelatedWord {
  id: number
  word: string
  reading: string
  vi: string
}

export interface CardView {
  card: CardRow
  deck: Deck
  isNew: boolean
  intervals: Record<'again' | 'hard' | 'good' | 'easy', string>
  vocab?: VocabNote
  kanji?: KanjiInfo[]
  related?: RelatedWord[]
  grammar?: GrammarNote
  exampleIndex?: number
}

/** Các từ đã học có chung kanji — tạo mạng liên kết giúp nhớ lâu. */
function relatedWords(note: VocabNote): RelatedWord[] {
  if (!note.kanji.length) return []
  const db = getDb()
  const out: RelatedWord[] = []
  for (const k of note.kanji) {
    const rows = db
      .prepare(
        `SELECT v.id, v.word, v.reading, v.vi FROM vocab v JOIN cards c ON c.note_id = v.id AND c.deck = 'vocab' AND c.ord = 0
         WHERE v.id != ? AND v.word LIKE ? AND c.state != 0 ORDER BY v.level DESC, v.rank LIMIT 3`
      )
      .all(note.id, `%${k}%`) as RelatedWord[]
    for (const r of rows) if (!out.some((o) => o.id === r.id)) out.push(r)
  }
  return out.slice(0, 6)
}

export function buildView(card: CardRow): CardView {
  const view: CardView = { card, deck: card.deck, isNew: card.state === 0, intervals: previewIntervals(card) }
  if (card.deck === 'vocab') {
    const v = getVocab(card.note_id)!
    view.vocab = v
    view.kanji = getKanjiMany(v.kanji)
    view.related = relatedWords(v)
  } else {
    const g = getDb().prepare('SELECT * FROM grammar WHERE id = ?').get(card.note_id)
    view.grammar = parseGrammar(g)
    // Mỗi lần ôn dùng một câu ví dụ khác để tránh "học thuộc câu"
    const n = view.grammar.examples.length || 1
    view.exampleIndex = card.reps % n
  }
  return view
}

export const srsApi = {
  'srs.next'(deck: Deck) {
    const { card, counts, nextLearnDue } = nextCard(deck)
    return { view: card ? buildView(card) : null, counts, nextLearnDue }
  },
  'srs.answer'(cardId: number, rating: Grade, durationMs: number) {
    return answerCard(cardId, rating, durationMs)
  },
  'srs.undo'() {
    return undoLast()
  },
  'srs.counts'(deck: Deck) {
    return deckCounts(deck)
  },
  'srs.cardInfo'(cardId: number) {
    const db = getDb()
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as CardRow
    const revs = db.prepare('SELECT * FROM revlog WHERE card_id = ? ORDER BY id').all(cardId)
    return { card, revs, retrievability: retrievability(card) }
  },
  'srs.setSuspended'(cardIds: number[], suspended: boolean) {
    const stmt = getDb().prepare('UPDATE cards SET queue = ? WHERE id = ?')
    for (const id of cardIds) stmt.run(suspended ? -1 : 0, id)
  },
  /** Đưa ghi chú lên đầu hàng đợi thẻ mới ("học ngay"). */
  'srs.learnNow'(deck: Deck, noteId: number) {
    const db = getDb()
    const min = (db.prepare('SELECT MIN(position) m FROM cards WHERE deck = ?').get(deck) as { m: number }).m ?? 0
    db.prepare('UPDATE cards SET position = ? + ord, queue = CASE WHEN queue = -1 THEN 0 ELSE queue END WHERE deck = ? AND note_id = ? AND state = 0').run(
      min - 10,
      deck,
      noteId
    )
  },
  /** Đặt lại thẻ về trạng thái mới (giữ lịch sử ôn). */
  'srs.forget'(cardIds: number[]) {
    const stmt = getDb().prepare(
      `UPDATE cards SET state = 0, due = 0, stability = 0, difficulty = 0, elapsed_days = 0, scheduled_days = 0,
       learning_steps = 0, reps = 0, lapses = 0, last_review = NULL, leech = 0 WHERE id = ?`
    )
    for (const id of cardIds) stmt.run(id)
  }
}
