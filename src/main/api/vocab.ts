/** API tra cứu/duyệt từ vựng, kanji và ngữ pháp. */
import { getDb } from '../db'
import { today, dayStart } from '../scheduler'
import { getKanjiMany, parseKanji, parseVocab } from './common'
import { parseGrammar } from './srs'

export type WordStatus = 'new' | 'learning' | 'review' | 'mature' | 'suspended'

const STATUS_SQL = `CASE WHEN c.queue = -1 THEN 'suspended' WHEN c.state = 0 THEN 'new'
  WHEN c.state IN (1,3) THEN 'learning' WHEN c.stability >= 21 THEN 'mature' ELSE 'review' END`

export interface BrowseQuery {
  q?: string
  level?: number
  status?: WordStatus | 'all' | 'leech'
  offset?: number
  limit?: number
}

export const vocabApi = {
  'vocab.browse'(query: BrowseQuery) {
    const db = getDb()
    const where: string[] = []
    const args: any[] = []
    if (query.q?.trim()) {
      where.push('(v.word LIKE ? OR v.reading LIKE ? OR v.vi LIKE ?)')
      const q = `%${query.q.trim()}%`
      args.push(q, q, q)
    }
    if (query.level) {
      where.push('v.level = ?')
      args.push(query.level)
    }
    if (query.status === 'leech') where.push('(c.leech = 1 OR c1.leech = 1)')
    else if (query.status && query.status !== 'all') {
      where.push(`(${STATUS_SQL}) = ?`)
      args.push(query.status)
    }
    const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const base = `FROM vocab v JOIN cards c ON c.deck = 'vocab' AND c.note_id = v.id AND c.ord = 0
      LEFT JOIN cards c1 ON c1.deck = 'vocab' AND c1.note_id = v.id AND c1.ord = 1 ${sqlWhere}`
    const total = (db.prepare(`SELECT COUNT(*) n ${base}`).get(...args) as { n: number }).n
    const rows = db
      .prepare(
        `SELECT v.id, v.word, v.reading, v.vi, v.level, ${STATUS_SQL} status, c.id card_id, c1.id card1_id,
          c.due, c.stability, c.lapses, c.leech, c1.state listen_state
         ${base} ORDER BY c.position LIMIT ? OFFSET ?`
      )
      .all(...args, query.limit ?? 50, query.offset ?? 0)
    return { total, rows: rows as any[] }
  },

  'vocab.detail'(id: number) {
    const db = getDb()
    const v = parseVocab(db.prepare('SELECT * FROM vocab WHERE id = ?').get(id))
    const cards = db.prepare(`SELECT * FROM cards WHERE deck = 'vocab' AND note_id = ? ORDER BY ord`).all(id)
    return { vocab: v, kanji: getKanjiMany(v.kanji), cards }
  },

  /** Từ đã gặp hôm nay (thẻ mới + ôn) — dùng cho playlist nghe thụ động. */
  'vocab.todayWords'() {
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT v.* FROM revlog r JOIN cards c ON c.id = r.card_id AND c.deck = 'vocab' JOIN vocab v ON v.id = c.note_id
         WHERE r.day >= ? ORDER BY r.id DESC LIMIT 150`
      )
      .all(today() - 0)
    return rows.map(parseVocab)
  },

  /** Từ học gần đây (N ngày) — playlist ôn nghe. */
  'vocab.recentWords'(days: number) {
    const rows = getDb()
      .prepare(
        `SELECT v.* FROM vocab v JOIN cards c ON c.deck = 'vocab' AND c.note_id = v.id AND c.ord = 0
         WHERE c.state != 0 AND c.last_review >= ? ORDER BY c.last_review DESC LIMIT 300`
      )
      .all(dayStart(today() - days))
    return rows.map(parseVocab)
  },

  'kanji.list'(level?: number) {
    const db = getDb()
    // Đếm số từ đã thuộc chứa mỗi kanji (tính trong JS cho nhanh)
    const knownWords = db
      .prepare(`SELECT v.word FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0 WHERE c.state = 2`)
      .all() as { word: string }[]
    const known = new Map<string, number>()
    for (const w of knownWords) for (const ch of new Set(w.word)) known.set(ch, (known.get(ch) ?? 0) + 1)
    const rows = db.prepare(`SELECT * FROM kanji ${level ? 'WHERE level = ?' : ''} ORDER BY level DESC, char`).all(...(level ? [level] : []))
    return rows.map((r: any) => ({ ...parseKanji(r), known: known.get(r.char) ?? 0 }))
  },

  'kanji.detail'(char: string) {
    const db = getDb()
    const k = getKanjiMany([char])[0]
    const words = db
      .prepare(
        `SELECT v.id, v.word, v.reading, v.vi, v.level, c.state FROM vocab v
         JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0 WHERE v.word LIKE ? ORDER BY v.level DESC, v.rank LIMIT 40`
      )
      .all(`%${char}%`)
    return { kanji: k, words }
  },

  'grammar.list'(level?: number) {
    const rows = getDb()
      .prepare(
        `SELECT g.*, c.id card_id, c.state, c.stability, c.queue FROM grammar g
         JOIN cards c ON c.deck = 'grammar' AND c.note_id = g.id
         ${level ? 'WHERE g.level = ?' : ''} ORDER BY c.position`
      )
      .all(...(level ? [level] : []))
    return rows.map((r: any) => ({ ...parseGrammar(r), cardId: r.card_id, state: r.state, stability: r.stability, queue: r.queue }))
  }
}
