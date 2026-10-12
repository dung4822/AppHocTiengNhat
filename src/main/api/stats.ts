/** Thống kê, thời gian học, cài đặt, trạng thái hệ thống. */
import { getDb } from '../db'
import { engineStatus, startEngine } from '../engine'
import { optimizeParameters } from '../optimizer'
import { estimateCostUSD, usageTotal } from '../services/deepseek'
import { type Settings, getSettings, updateSettings } from '../settings'
import { dayStart, forecast, today } from '../scheduler'

export type Module = 'vocab' | 'listening' | 'reading' | 'grammar' | 'jlpt'

export const statsApi = {
  /** Cộng dồn thời gian học (renderer gửi mỗi ~15 giây khi đang học thật). */
  'study.tick'(module: Module, seconds: number) {
    if (seconds <= 0 || seconds > 120) return
    getDb()
      .prepare(
        `INSERT INTO study_log(day, module, seconds) VALUES(?, ?, ?)
         ON CONFLICT(day, module) DO UPDATE SET seconds = seconds + excluded.seconds`
      )
      .run(today(), module, Math.round(seconds))
  },

  'study.today'() {
    const rows = getDb().prepare('SELECT module, seconds FROM study_log WHERE day = ?').all(today()) as { module: string; seconds: number }[]
    const out: Record<string, number> = {}
    for (const r of rows) out[r.module] = r.seconds
    return { seconds: out, budget: getSettings().budget }
  },

  'stats.overview'() {
    const db = getDb()
    const t = today()
    const levels = db
      .prepare(
        `SELECT v.level, COUNT(*) total,
           SUM(CASE WHEN c.state != 0 THEN 1 ELSE 0 END) seen,
           SUM(CASE WHEN c.state = 2 THEN 1 ELSE 0 END) known,
           SUM(CASE WHEN c.state = 2 AND c.stability >= 21 THEN 1 ELSE 0 END) mature
         FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0
         WHERE v.custom = 0 GROUP BY v.level ORDER BY v.level DESC`
      )
      .all() as { level: number; total: number; seen: number; known: number; mature: number }[]
    const listen = db
      .prepare(`SELECT SUM(CASE WHEN state = 2 THEN 1 ELSE 0 END) known, SUM(CASE WHEN state != 0 THEN 1 ELSE 0 END) seen FROM cards WHERE deck='vocab' AND ord=1`)
      .get() as { known: number; seen: number }
    const grammar = db
      .prepare(
        `SELECT g.level, COUNT(*) total, SUM(CASE WHEN c.state != 0 THEN 1 ELSE 0 END) seen, SUM(CASE WHEN c.state = 2 THEN 1 ELSE 0 END) known
         FROM grammar g JOIN cards c ON c.deck='grammar' AND c.note_id=g.id GROUP BY g.level ORDER BY g.level DESC`
      )
      .all() as { level: number; total: number; seen: number; known: number }[]
    const kanji = db
      .prepare(
        `SELECT COUNT(*) total, SUM(CASE WHEN EXISTS (SELECT 1 FROM vocab v JOIN cards c ON c.deck='vocab' AND c.note_id=v.id AND c.ord=0
           WHERE c.state = 2 AND v.word LIKE '%' || k.char || '%') THEN 1 ELSE 0 END) known FROM kanji k`
      )
      .get() as { total: number; known: number }
    const ret = db
      .prepare(`SELECT COUNT(*) n, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) pass FROM revlog WHERE state = 2 AND day >= ?`)
      .get(t - 30) as { n: number; pass: number }
    const retMature = db
      .prepare(
        `SELECT COUNT(*) n, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) pass FROM revlog WHERE state = 2 AND day >= ? AND scheduled_days >= 0
         AND card_id IN (SELECT id FROM cards WHERE stability >= 21)`
      )
      .get(t - 30) as { n: number; pass: number }

    // chuỗi ngày học liên tiếp
    const days = new Set(
      (db.prepare('SELECT DISTINCT day FROM revlog UNION SELECT DISTINCT day FROM study_log WHERE seconds > 60').all() as { day: number }[]).map((r) => r.day)
    )
    let streak = 0
    for (let d = days.has(t) ? t : t - 1; days.has(d); d--) streak++

    const totals = db.prepare('SELECT COUNT(*) reviews FROM revlog').get() as { reviews: number }
    const totalSec = (db.prepare('SELECT SUM(seconds) s FROM study_log').get() as { s: number | null }).s ?? 0

    // Dự kiến ngày học xong toàn bộ từ vựng N3
    // Trung bình theo số ngày thực sự có học trong 7 ngày gần nhất
    const recent = db
      .prepare(
        `SELECT COUNT(DISTINCT r.card_id) n, COUNT(DISTINCT r.day) d FROM revlog r JOIN cards c ON c.id = r.card_id AND c.deck='vocab' AND c.ord=0
         WHERE r.state = 0 AND r.day >= ?`
      )
      .get(t - 6) as { n: number; d: number }
    const newPerDay = recent.d ? recent.n / recent.d : 0
    const remaining = levels.reduce((a, l) => a + (l.total - l.seen), 0)
    const etaDays = newPerDay > 0 ? Math.ceil(remaining / newPerDay) : null

    return {
      levels,
      listen,
      grammar,
      kanji,
      retention: ret.n ? ret.pass / ret.n : null,
      retentionMature: retMature.n ? retMature.pass / retMature.n : null,
      retentionSample: ret.n,
      streak,
      totalReviews: totals.reviews,
      totalHours: totalSec / 3600,
      newPerDay,
      remaining,
      etaDays,
      etaDate: etaDays != null ? dayStart(t + etaDays) : null
    }
  },

  'stats.history'(n: number) {
    const db = getDb()
    const t = today()
    const revs = db
      .prepare(
        `SELECT r.day, c.deck, SUM(CASE WHEN r.state = 0 THEN 1 ELSE 0 END) new, SUM(CASE WHEN r.state != 0 THEN 1 ELSE 0 END) rev,
           SUM(CASE WHEN r.state = 2 AND r.rating = 1 THEN 1 ELSE 0 END) fail
         FROM revlog r JOIN cards c ON c.id = r.card_id WHERE r.day > ? GROUP BY r.day, c.deck`
      )
      .all(t - n) as { day: number; deck: string; new: number; rev: number; fail: number }[]
    const time = db.prepare('SELECT day, module, seconds FROM study_log WHERE day > ?').all(t - n) as { day: number; module: string; seconds: number }[]
    return Array.from({ length: n }, (_, i) => {
      const d = t - n + 1 + i
      const rv = revs.filter((r) => r.day === d)
      const tm: Record<string, number> = {}
      for (const x of time.filter((x) => x.day === d)) tm[x.module] = x.seconds
      return {
        day: d,
        date: dayStart(d),
        newCards: rv.reduce((a, r) => a + r.new, 0),
        reviews: rv.reduce((a, r) => a + r.rev, 0),
        fails: rv.reduce((a, r) => a + r.fail, 0),
        minutes: Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, v / 60]))
      }
    })
  },

  'stats.forecast'(days: number) {
    return forecast(days)
  },

  'settings.get'() {
    return getSettings()
  },
  'settings.update'(patch: Partial<Settings>) {
    return updateSettings(patch)
  },
  'fsrs.optimize'() {
    return optimizeParameters()
  },

  async 'system.status'() {
    return {
      engine: await engineStatus(),
      apiKey: !!process.env.DEEPSEEK_API_KEY,
      aiCost: estimateCostUSD(),
      aiTokens: usageTotal.completionTokens
    }
  },
  'engine.start'() {
    return startEngine()
  },
  async 'ai.balance'() {
    try {
      const r = await fetch(`${process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'}/user/balance`, {
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        signal: AbortSignal.timeout(8000)
      })
      const d: any = await r.json()
      return d.balance_infos?.[0]?.total_balance ? `${d.balance_infos[0].total_balance} ${d.balance_infos[0].currency}` : null
    } catch {
      return null
    }
  }
}
