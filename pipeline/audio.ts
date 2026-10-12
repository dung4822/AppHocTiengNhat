/**
 * Bước 6: sinh audio bằng AivisSpeech (cần engine đang chạy: tools/start-aivis.bat).
 * Thứ tự ưu tiên: N5 → N4 → N3 (từ + câu ví dụ + ngữ pháp), bỏ qua file đã có.
 * Chạy lại bất cứ lúc nào để tiếp tục.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pool } from '../src/main/services/deepseek'
import { AUDIO_DIR } from '../src/main/services/paths'
import { engineAlive, synthToFile } from '../src/main/services/tts'
import type { ContentGrammar, ContentVocab } from './build-content'
import { readContent } from './lib'

interface Job {
  text: string
  file: string
  accent?: number | null
}

async function main() {
  if (!(await engineAlive())) {
    console.error('AivisSpeech Engine chưa chạy. Mở tools/start-aivis.bat trước.')
    process.exit(1)
  }
  const vocab = readContent<ContentVocab[]>('vocab.json')
  const grammar = readContent<ContentGrammar[]>('grammar.json')
  const jobs: Job[] = []
  for (const lv of [5, 4, 3]) {
    for (const v of vocab.filter((x) => x.level === lv).sort((a, b) => a.rank - b.rank)) {
      jobs.push({ text: v.reading, file: v.audio, accent: v.pitch?.[0] ?? null })
      if (v.ex) jobs.push({ text: v.ex, file: v.exAudio })
    }
    for (const g of grammar.filter((x) => x.level === lv)) for (const e of g.examples) jobs.push({ text: e.jp, file: e.audio })
  }
  const todo = jobs.filter((j) => !fs.existsSync(path.join(AUDIO_DIR, j.file)))
  console.log(`Audio: ${jobs.length} tổng, cần tạo ${todo.length}`)
  const t0 = Date.now()
  let done = 0
  let failed = 0
  await pool(todo, 2, async (j) => {
    try {
      await synthToFile(j.text, path.join(AUDIO_DIR, j.file), { accent: j.accent })
    } catch (e) {
      failed++
      console.error('Lỗi audio:', j.text, (e as Error).message)
    }
    done++
    if (done % 100 === 0) {
      const rate = (Date.now() - t0) / done
      console.log(`${done}/${todo.length} (lỗi ${failed}) ~${(rate / 1000).toFixed(2)}s/file, còn ~${Math.round(((todo.length - done) * rate) / 60000)} phút`)
    }
  })
  console.log(`Xong. Lỗi: ${failed}`)
}

main()
