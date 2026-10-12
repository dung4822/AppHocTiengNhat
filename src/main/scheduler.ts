/**
 * Bộ lập lịch kiểu Anki (FSRS-6) cho các deck: vocab, grammar.
 *
 * Bám theo hành vi của Anki:
 *  - Ngày học bắt đầu lúc 4h sáng (dayStartHour); thẻ review được xếp theo NGÀY.
 *  - Learning/relearning steps theo phút (1m 10m / 10m), do ts-fsrs xử lý giống Anki.
 *  - Fuzz khoảng ôn: dùng get_fuzz_range (cùng công thức fuzz của Anki).
 *  - Load balancer (Anki 24.11+): chọn ngày trong khoảng fuzz, ưu tiên ngày ít thẻ.
 *  - Bury siblings: trả lời 1 thẻ thì hoãn thẻ anh em (cùng từ) tới ngày mai.
 *  - Leech: quên ≥ 8 lần thì gắn nhãn leech.
 *  - Learn ahead limit 20 phút; undo câu trả lời gần nhất.
 */
import {
  type Card as FCard,
  type Grade,
  type RecordLogItem,
  Rating,
  State,
  fsrs,
  generatorParameters,
  get_fuzz_range,
  type StepUnit
} from 'ts-fsrs'
import { getDb } from './db'
import { getSettings } from './settings'

export type Deck = 'vocab' | 'grammar'

export interface CardRow {
  id: number
  deck: Deck
  note_id: number
  ord: number
  position: number
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: number | null
  queue: number
  buried_day: number
  leech: number
}

const DAY_MS = 86_400_000

// ---------------------------------------------------------------- Ngày học

/** Số thứ tự ngày học (theo giờ địa phương, đổi ngày lúc dayStartHour). */
export function dayIndex(ts = Date.now()): number {
  const h = getSettings().dayStartHour
  const offset = new Date(ts).getTimezoneOffset() * 60_000
  return Math.floor((ts - offset - h * 3_600_000) / DAY_MS)
}

/** Thời điểm bắt đầu của ngày học thứ `day` (ms). */
export function dayStart(day: number): number {
  const h = getSettings().dayStartHour
  const approx = day * DAY_MS + h * 3_600_000
  const offset = new Date(approx).getTimezoneOffset() * 60_000
  return approx + offset
}

export const today = () => dayIndex()
export const todayEnd = () => dayStart(today() + 1)

// ---------------------------------------------------------------- FSRS

function scheduler() {
  const s = getSettings()
  return fsrs(
    generatorParameters({
      request_retention: s.desiredRetention,
      maximum_interval: s.maximumInterval,
      enable_fuzz: false, // fuzz + load balancer tự làm bên dưới (giống Anki)
      enable_short_term: true,
      learning_steps: s.learningSteps as StepUnit[],
      relearning_steps: s.relearningSteps as StepUnit[],
      ...(s.fsrsParams ? { w: s.fsrsParams } : {})
    })
  )
}

export function toFsrs(c: CardRow): FCard {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.last_review ? new Date(c.last_review) : undefined
  }
}

/** PRNG có seed (Anki dùng seed = card id + reps để fuzz ổn định). */
function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Số thẻ review đang hẹn vào từng ngày trong khoảng [from, to]. */
function dueCountsByDay(deck: Deck, from: number, to: number): Map<number, number> {
  const rows = getDb()
    .prepare(
      `SELECT due FROM cards WHERE deck = ? AND state = ${State.Review} AND queue >= 0 AND due >= ? AND due < ?`
    )
    .all(deck, dayStart(from), dayStart(to + 1)) as { due: number }[]
  const m = new Map<number, number>()
  for (const r of rows) {
    const d = dayIndex(r.due)
    m.set(d, (m.get(d) ?? 0) + 1)
  }
  return m
}

/**
 * Chọn khoảng ôn cuối cùng cho thẻ review: fuzz + load balancer.
 * Load balancer của Anki: trọng số mỗi ngày ứng viên = 1/(số thẻ)^2 × 1/khoảng, rồi chọn ngẫu nhiên có trọng số.
 */
function fuzzInterval(deck: Deck, card: CardRow, ivl: number, elapsed: number): number {
  const s = getSettings()
  if (!s.enableFuzz || ivl < 2.5) return Math.max(1, Math.round(ivl))
  const { min_ivl, max_ivl } = get_fuzz_range(ivl, elapsed, s.maximumInterval)
  const rand = seeded(card.id * 1000 + card.reps)
  if (!s.loadBalancer || max_ivl - min_ivl < 1) return min_ivl + Math.floor(rand() * (max_ivl - min_ivl + 1))
  const t = today()
  const counts = dueCountsByDay(deck, t + min_ivl, t + max_ivl)
  const cands: { ivl: number; w: number }[] = []
  for (let i = min_ivl; i <= max_ivl; i++) {
    const n = counts.get(t + i) ?? 0
    cands.push({ ivl: i, w: (n === 0 ? 1 : 1 / (n * n)) * (1 / i) })
  }
  const total = cands.reduce((a, c) => a + c.w, 0)
  let r = rand() * total
  for (const c of cands) {
    r -= c.w
    if (r <= 0) return c.ivl
  }
  return cands[cands.length - 1].ivl
}

/** Áp kết quả FSRS vào thẻ (xử lý ngày-review giống Anki). */
function applyResult(card: CardRow, item: RecordLogItem, now: number): Partial<CardRow> {
  const c = item.card
  let due = c.due.getTime()
  let scheduled = c.scheduled_days
  if (c.state === State.Review) {
    const elapsed = card.last_review ? Math.max(0, today() - dayIndex(card.last_review)) : 0
    scheduled = fuzzInterval(card.deck, card, c.scheduled_days, elapsed)
    due = dayStart(today() + scheduled)
  }
  return {
    due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: scheduled,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: now
  }
}

/** Mô tả khoảng ôn cho 4 nút (giống Anki hiển thị trên nút). */
export function previewIntervals(card: CardRow): Record<'again' | 'hard' | 'good' | 'easy', string> {
  const now = new Date()
  const p = scheduler().repeat(toFsrs(card), now)
  const fmt = (it: RecordLogItem) => {
    if (it.card.state === State.Review) return fmtDays(Math.max(1, Math.round(it.card.scheduled_days)))
    return fmtMs(it.card.due.getTime() - now.getTime())
  }
  return { again: fmt(p[Rating.Again]), hard: fmt(p[Rating.Hard]), good: fmt(p[Rating.Good]), easy: fmt(p[Rating.Easy]) }
}

export function fmtMs(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m < 60) return `${m} phút`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} giờ`
  return fmtDays(Math.round(h / 24))
}
export function fmtDays(d: number): string {
  if (d < 30) return `${d} ngày`
  if (d < 365) return `${(d / 30).toFixed(1).replace('.0', '')} tháng`
  return `${(d / 365).toFixed(1).replace('.0', '')} năm`
}

// ---------------------------------------------------------------- Hàng đợi

export interface DeckCounts {
  newCount: number
  learnCount: number
  reviewCount: number
  newLimit: number
  newDone: number
  reviewDone: number
}

function unburyIfNeeded() {
  getDb().prepare('UPDATE cards SET queue = 0 WHERE queue = -2 AND buried_day < ?').run(today())
}

/** Số thẻ mới đã học hôm nay của deck. */
function newDoneToday(deck: Deck): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(DISTINCT r.card_id) n FROM revlog r JOIN cards c ON c.id = r.card_id
         WHERE c.deck = ? AND r.day = ? AND r.state = ${State.New}`
      )
      .get(deck, today()) as { n: number }
  ).n
}

function reviewDoneToday(deck: Deck): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(DISTINCT r.card_id) n FROM revlog r JOIN cards c ON c.id = r.card_id
         WHERE c.deck = ? AND r.day = ? AND r.state = ${State.Review}`
      )
      .get(deck, today()) as { n: number }
  ).n
}

/**
 * Giới hạn thẻ mới/ngày. Với deck vocab có thể tự tính theo ngân sách thời gian:
 *  - thời gian còn lại = ngân sách − (số thẻ review hôm nay × giây/thẻ review)
 *  - nhưng không vượt mức "trạng thái ổn định": ngân sách / (chi phí thẻ mới + 8 × chi phí review)
 */
export function newLimit(deck: Deck): number {
  const s = getSettings()
  if (deck === 'grammar') return s.grammarNewPerDay
  if (!s.autoNewByBudget) return s.newPerDay
  const db = getDb()
  const since = today() - 14
  const avgRev =
    ((db.prepare(`SELECT AVG(MIN(duration_ms, 60000)) a FROM revlog WHERE day >= ? AND state = ${State.Review}`).get(since) as any)
      .a ?? 8000) / 1000
  const newCost =
    ((db
      .prepare(
        `SELECT AVG(t) a FROM (SELECT SUM(MIN(duration_ms, 60000)) t FROM revlog r WHERE r.day >= ? AND r.card_id IN
           (SELECT card_id FROM revlog WHERE state = ${State.New} AND day >= ?) AND r.state IN (0,1) GROUP BY card_id)`
      )
      .get(since, since) as any).a ?? 30000) / 1000
  const budget = (s.budget.vocab ?? 80) * 60
  const t = today()
  const dueReviews = (
    db
      .prepare(`SELECT COUNT(*) n FROM cards WHERE deck = 'vocab' AND state = ${State.Review} AND queue >= 0 AND due < ?`)
      .get(dayStart(t + 1)) as { n: number }
  ).n + reviewDoneToday('vocab')
  const dynamic = Math.floor((budget - dueReviews * avgRev) / newCost)
  const steady = Math.floor(budget / (newCost + 8 * avgRev))
  return Math.max(5, Math.min(dynamic, steady, s.maxAutoNewPerDay))
}

/** Điều kiện thẻ mới được phép học (thẻ nghe chỉ mở khi thẻ nhận diện đã ra khỏi learning). */
function newCardFilter(deck: Deck): string {
  if (deck !== 'vocab') return ''
  const s = getSettings()
  if (!s.listeningCards) return 'AND c.ord = 0'
  return `AND (c.ord = 0 OR EXISTS (SELECT 1 FROM cards c0 WHERE c0.deck = 'vocab' AND c0.note_id = c.note_id AND c0.ord = 0 AND c0.state = ${State.Review}))`
}

export function deckCounts(deck: Deck): DeckCounts {
  unburyIfNeeded()
  const db = getDb()
  const end = todayEnd()
  const limit = newLimit(deck)
  const done = newDoneToday(deck)
  const revDone = reviewDoneToday(deck)
  const s = getSettings()
  const learnCount = (
    db.prepare(`SELECT COUNT(*) n FROM cards WHERE deck = ? AND state IN (1,3) AND queue = 0 AND due < ?`).get(deck, end) as any
  ).n
  const reviewAvail = (
    db.prepare(`SELECT COUNT(*) n FROM cards WHERE deck = ? AND state = 2 AND queue = 0 AND due < ?`).get(deck, end) as any
  ).n
  const newAvail = (
    db.prepare(`SELECT COUNT(*) n FROM cards c WHERE c.deck = ? AND c.state = 0 AND c.queue = 0 ${newCardFilter(deck)}`).get(deck) as any
  ).n
  return {
    newCount: Math.max(0, Math.min(newAvail, limit - done)),
    learnCount,
    reviewCount: Math.max(0, Math.min(reviewAvail, s.maxReviewsPerDay - revDone)),
    newLimit: limit,
    newDone: done,
    reviewDone: revDone
  }
}

/**
 * Lấy thẻ tiếp theo (thứ tự giống Anki v3):
 *  1. thẻ learning/relearning đã tới hạn
 *  2. thẻ review tới hạn hôm nay xen kẽ thẻ mới (rải đều)
 *  3. nếu hết: thẻ learning sắp tới hạn trong 20 phút (learn ahead)
 */
export function nextCard(deck: Deck): { card: CardRow | null; counts: DeckCounts; nextLearnDue: number | null } {
  const db = getDb()
  const counts = deckCounts(deck)
  const now = Date.now()
  const s = getSettings()

  const learnDue = db
    .prepare(`SELECT * FROM cards WHERE deck = ? AND state IN (1,3) AND queue = 0 AND due <= ? ORDER BY due LIMIT 1`)
    .get(deck, now) as CardRow | undefined
  if (learnDue) return { card: learnDue, counts, nextLearnDue: null }

  const review =
    counts.reviewCount > 0
      ? (db
          .prepare(
            `SELECT * FROM cards WHERE deck = ? AND state = 2 AND queue = 0 AND due < ? ORDER BY due, (id * 7919) % 1000 LIMIT 1`
          )
          .get(deck, todayEnd()) as CardRow | undefined)
      : undefined
  const fresh =
    counts.newCount > 0
      ? (db
          .prepare(`SELECT * FROM cards c WHERE c.deck = ? AND c.state = 0 AND c.queue = 0 ${newCardFilter(deck)} ORDER BY c.position LIMIT 1`)
          .get(deck) as CardRow | undefined)
      : undefined

  if (review && fresh) {
    // Rải đều thẻ mới giữa các thẻ review (giống tuỳ chọn "Mix with reviews" của Anki)
    const every = Math.max(1, Math.round(counts.reviewCount / Math.max(1, counts.newCount)))
    return { card: (reviewsSinceNew[deck] ?? 0) >= every ? fresh : review, counts, nextLearnDue: null }
  }
  if (review || fresh) return { card: (review ?? fresh)!, counts, nextLearnDue: null }

  const ahead = db
    .prepare(`SELECT * FROM cards WHERE deck = ? AND state IN (1,3) AND queue = 0 ORDER BY due LIMIT 1`)
    .get(deck) as CardRow | undefined
  if (ahead && ahead.due <= now + s.learnAheadMinutes * 60_000) return { card: ahead, counts, nextLearnDue: null }
  return { card: null, counts, nextLearnDue: ahead && ahead.due < todayEnd() ? ahead.due : null }
}

// ---------------------------------------------------------------- Trả lời

const reviewsSinceNew: Partial<Record<Deck, number>> = {}

interface UndoEntry {
  before: CardRow
  revlogId: number
  buriedIds: number[]
}
const undoStack: UndoEntry[] = []

export function answerCard(cardId: number, rating: Grade, durationMs: number): { leech: boolean } {
  const db = getDb()
  const s = getSettings()
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as CardRow
  if (!card) throw new Error('Không tìm thấy thẻ')
  const now = Date.now()
  const item = scheduler().next(toFsrs(card), new Date(now), rating)
  const upd = applyResult(card, item, now)

  let leech = false
  if (card.state === State.Review && rating === Rating.Again) {
    const lapses = (upd.lapses ?? 0)
    if (lapses >= s.leechThreshold && (lapses - s.leechThreshold) % Math.ceil(s.leechThreshold / 2) === 0) leech = true
  }

  let revlogId = now
  while (db.prepare('SELECT 1 FROM revlog WHERE id = ?').get(revlogId)) revlogId++
  const buriedIds: number[] = []

  db.transaction(() => {
    db.prepare(
      `UPDATE cards SET due=@due, stability=@stability, difficulty=@difficulty, elapsed_days=@elapsed_days,
       scheduled_days=@scheduled_days, learning_steps=@learning_steps, reps=@reps, lapses=@lapses, state=@state,
       last_review=@last_review, leech = CASE WHEN @leech THEN 1 ELSE leech END WHERE id=@id`
    ).run({ ...upd, id: card.id, leech: leech ? 1 : 0 })
    const log = item.log
    db.prepare(
      `INSERT INTO revlog(id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days,
       scheduled_days, learning_steps, duration_ms, day) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      revlogId, card.id, rating, card.state, card.due, upd.stability, upd.difficulty,
      log.elapsed_days, log.last_elapsed_days, upd.scheduled_days, upd.learning_steps,
      Math.min(durationMs, 120_000), today()
    )
    if (s.burySiblings) {
      const sibs = db
        .prepare(`SELECT id FROM cards WHERE deck = ? AND note_id = ? AND id != ? AND queue = 0 AND state IN (0,2) AND (state = 0 OR due < ?)`)
        .all(card.deck, card.note_id, card.id, todayEnd()) as { id: number }[]
      for (const sb of sibs) {
        db.prepare('UPDATE cards SET queue = -2, buried_day = ? WHERE id = ?').run(today(), sb.id)
        buriedIds.push(sb.id)
      }
    }
  })()
  if (card.state === State.New) reviewsSinceNew[card.deck] = 0
  else if (card.state === State.Review) reviewsSinceNew[card.deck] = (reviewsSinceNew[card.deck] ?? 0) + 1
  undoStack.push({ before: card, revlogId, buriedIds })
  if (undoStack.length > 50) undoStack.shift()
  return { leech }
}

export function undoLast(): number | null {
  const u = undoStack.pop()
  if (!u) return null
  const db = getDb()
  db.transaction(() => {
    const b = u.before
    db.prepare(
      `UPDATE cards SET due=@due, stability=@stability, difficulty=@difficulty, elapsed_days=@elapsed_days,
       scheduled_days=@scheduled_days, learning_steps=@learning_steps, reps=@reps, lapses=@lapses, state=@state,
       last_review=@last_review, queue=@queue, leech=@leech WHERE id=@id`
    ).run(b)
    db.prepare('DELETE FROM revlog WHERE id = ?').run(u.revlogId)
    for (const id of u.buriedIds) db.prepare('UPDATE cards SET queue = 0 WHERE id = ?').run(id)
  })()
  return u.before.id
}

/** Độ nhớ hiện tại (retrievability) của thẻ, 0..1. */
export function retrievability(card: CardRow): number {
  if (card.state === State.New) return 0
  return scheduler().get_retrievability(toFsrs(card), new Date(), false)
}

/** Dự báo số thẻ review tới hạn trong N ngày tới. */
export function forecast(days: number): { day: number; vocab: number; grammar: number }[] {
  const t = today()
  const rows = getDb()
    .prepare(`SELECT deck, due FROM cards WHERE state = 2 AND queue >= -2 AND due < ?`)
    .all(dayStart(t + days)) as { deck: Deck; due: number }[]
  const out = Array.from({ length: days }, (_, i) => ({ day: i, vocab: 0, grammar: 0 }))
  for (const r of rows) {
    const d = Math.max(0, dayIndex(r.due) - t)
    if (d < days) out[d][r.deck]++
  }
  return out
}
