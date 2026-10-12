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
