/**
 * Từ điển tra cứu nhanh (JMdict, các mục phổ biến) cho chế độ đọc: bấm vào từ lạ để xem nghĩa.
 * Kết quả: data/content/dict.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { RAW_DIR } from '../src/main/services/paths'
import { writeContent } from './lib'

function main() {
  const jm = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'jmdict-eng-3.6.2.json'), 'utf8'))
  const out: { w: string; r: string; e: string; c: number }[] = []
  for (const w of jm.words) {
    const common = w.kanji.some((k: any) => k.common) || w.kana.some((k: any) => k.common)
    if (!common) continue
    const e = w.sense.slice(0, 3).map((s: any) => s.gloss.slice(0, 3).map((g: any) => g.text).join(', ')).join('; ')
    const r = w.kana[0].text
    const forms = w.kanji.length ? w.kanji.filter((k: any) => k.common || w.kanji.length === 1).map((k: any) => k.text) : [r]
    for (const f of forms) out.push({ w: f, r, e, c: 1 })
  }
  writeContent('dict.json', out)
  console.log('dict entries', out.length)
}

main()
