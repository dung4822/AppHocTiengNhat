/**
 * Kiểm thử nhanh (chạy khi SMOKE_TEST=1): gọi các API chính và chụp màn hình từng trang.
 * Dùng DB riêng (data/smoke.db) để không ảnh hưởng dữ liệu học thật.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { DATA_DIR, ensureDir } from './services/paths'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runSmoke(win: BrowserWindow, api: Record<string, (...a: any[]) => any>) {
  const out = ensureDir(path.join(DATA_DIR, 'cache', 'screens'))
  const log = (...a: unknown[]) => console.log('[smoke]', ...a)
  const shot = async (name: string) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG())
    log('screenshot', name)
  }
  const go = async (hash: string, wait = 1500) => {
    await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`)
    await sleep(wait)
  }
  const mode = process.env.SMOKE_TEST ?? '1'
  if (mode === 'sched') {
    try {
      await schedTest(log)
    } catch (e) {
      log('ERROR', (e as Error).stack)
    }
    win.close()
    return
  }
  try {
    await sleep(2500)
    // ---- Mô phỏng một buổi ôn thẻ
    const counts = api['srs.counts']('vocab')
    log('counts', counts)
    let n = 0
    for (let i = 0; i < 12; i++) {
      const r = api['srs.next']('vocab')
      if (!r.view) break
      const c = r.view.card
      api['srs.answer'](c.id, i % 5 === 0 ? 1 : 3, 4000)
      n++
      if (i === 0) log('first card', r.view.vocab?.word, r.view.intervals)
    }
    log('answered', n, api['srs.counts']('vocab'))
    log('undo ->', api['srs.undo']())
    const g = api['srs.next']('grammar')
    log('grammar card', g.view?.grammar?.pattern)
    if (g.view) api['srs.answer'](g.view.card.id, 3, 5000)
    log('jlpt make', api['jlpt.make'](['kanjiReading', 'orthography', 'context', 'grammar'], 8).map((q: any) => `${q.type}: ${q.prompt} => ${q.choices[q.answer]} | ${q.choices.join('/')}`))
    log('overview', JSON.stringify(api['stats.overview']()).slice(0, 400))
    log('newLimit', api['srs.counts']('vocab').newLimit)

    if (mode === 'ai') {
      const rid = await api['reading.generate']({ length: 'short' })
      const p = api['passage.get'](rid)
      log('reading', p.title, p.sentences.length, 'coverage', p.coverage)
      const lid = await api['listening.generate']({ kind: 'dialogue' })
      log('listening', api['passage.get'](lid).title)
      await go(`#/reading/${rid}`, 2500)
      await shot('reading-passage')
      await go(`#/listening/${lid}`, 2500)
      await shot('listening-player')
    }

    for (const [name, hash] of [
      ['home', '#/'],
      ['vocab', '#/vocab'],
      ['grammar', '#/grammar'],
      ['listening', '#/listening'],
      ['reading', '#/reading'],
      ['jlpt', '#/jlpt'],
      ['stats', '#/stats'],
      ['settings', '#/settings']
    ] as const) {
      await go(hash, 2000)
      await shot(name)
    }
    // Lật thẻ từ vựng
    await go('#/vocab', 1500)
    await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))`)
    await sleep(1200)
    await shot('vocab-revealed')
  } catch (e) {
    log('ERROR', (e as Error).stack)
  }
  win.close()
}

/** Kiểm tra vòng đời thẻ & load balancer trên DB thử nghiệm. */
async function schedTest(log: (...a: unknown[]) => void) {
  const { getDb } = await import('./db')
  const sch = await import('./scheduler')
  const db = getDb()
  const get = (id: number) => db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as any
  const fmt = (c: any) => `state=${c.state} step=${c.learning_steps} S=${c.stability.toFixed(2)} D=${c.difficulty.toFixed(2)} ivl=${c.scheduled_days} due=${new Date(c.due).toLocaleString('vi-VN')} lapses=${c.lapses}`
  const r = sch.nextCard('vocab')
  const id = r.card!.id
  sch.answerCard(id, 3, 5000)
  log('new→Good:', fmt(get(id)))
  db.prepare('UPDATE cards SET due = ? WHERE id = ?').run(Date.now() - 1000, id)
  sch.answerCard(id, 3, 5000)
  log('learn→Good:', fmt(get(id)))
  // giả lập đã qua đúng hạn
  const c1 = get(id)
  db.prepare('UPDATE cards SET due = ?, last_review = ? WHERE id = ?').run(Date.now() - 1000, Date.now() - c1.scheduled_days * 86400000, id)
  log('preview khi tới hạn:', JSON.stringify(sch.previewIntervals(get(id))))
  sch.answerCard(id, 3, 5000)
  log('review→Good:', fmt(get(id)))
  db.prepare('UPDATE cards SET due = ?, last_review = ? WHERE id = ?').run(Date.now() - 1000, Date.now() - get(id).scheduled_days * 86400000, id)
  sch.answerCard(id, 1, 5000)
  log('review→Again:', fmt(get(id)))
  db.prepare('UPDATE cards SET due = ? WHERE id = ?').run(Date.now() - 1000, id)
  sch.answerCard(id, 3, 5000)
  log('relearn→Good:', fmt(get(id)))

  // Load balancer: 300 thẻ review giống hệt nhau (S=20 ngày), trả lời Good → xem phân bố ngày
  const ids = (db.prepare(`SELECT id FROM cards WHERE deck='vocab' AND state = 0 LIMIT 300 OFFSET 50`).all() as { id: number }[]).map((x) => x.id)
  const last = Date.now() - 20 * 86400000
  for (const cid of ids)
    db.prepare(`UPDATE cards SET state=2, stability=20, difficulty=5, scheduled_days=20, reps=3, due=?, last_review=? WHERE id=?`).run(Date.now() - 1000, last, cid)
  const hist = new Map<number, number>()
  for (const cid of ids) {
    sch.answerCard(cid, 3, 3000)
    const c = get(cid)
    hist.set(c.scheduled_days, (hist.get(c.scheduled_days) ?? 0) + 1)
  }
  log('phân bố khoảng ôn sau Good (300 thẻ):', JSON.stringify([...hist.entries()].sort((a, b) => a[0] - b[0])))
  log('dayIndex hôm nay', sch.today(), 'bắt đầu ngày', new Date(sch.dayStart(sch.today())).toLocaleString('vi-VN'))
}
