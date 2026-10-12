/**
 * Bước 3: DeepSeek bổ sung cho từ vựng: nghĩa tiếng Việt, ghi chú cách dùng, 1 câu ví dụ + dịch.
 * Câu ví dụ được giới hạn dùng từ vựng không khó hơn cấp của từ đích (i+1).
 */
import { chatJSON, configFromEnv, pool } from '../src/main/services/deepseek'
import type { BaseVocab } from './base'
import { JsonlCache, chunk, logCost, readContent } from './lib'

export interface VocabInfo {
  vi: string
  note: string
  ex: string
  exVi: string
}

const SYSTEM = `Bạn là giáo viên tiếng Nhật giỏi, soạn thẻ từ vựng cho người Việt luyện thi JLPT.
Với mỗi từ, trả về:
- "vi": nghĩa tiếng Việt ngắn gọn, tự nhiên (≤ 10 từ), các nghĩa cách nhau bởi "; ". Chỉ nghĩa phổ biến.
- "note": ghi chú ngắn (≤ 15 từ) về sắc thái/cách dùng/trợ từ đi kèm/phân biệt từ dễ nhầm. Để "" nếu không cần.
- "ex": 1 câu ví dụ tiếng Nhật TỰ NHIÊN, ngắn (8–22 ký tự), dùng đúng từ đích (được chia thể), các từ còn lại chỉ ở mức JLPT {LEVEL} trở xuống. Viết bằng kanji như người Nhật viết bình thường.
- "exVi": dịch câu ví dụ sang tiếng Việt tự nhiên.
Trả về JSON: {"items":[{"k":"<key>","vi":"...","note":"...","ex":"...","exVi":"..."}]}`

async function main() {
  const cfg = configFromEnv()
  const vocab = readContent<BaseVocab[]>('base-vocab.json')
  const cache = new JsonlCache<VocabInfo>('vocab')
  const levels = process.argv[2] ? process.argv[2].split(',').map(Number) : [5, 4, 3]
  const todo = vocab.filter((v) => levels.includes(v.level) && !cache.has(v.key))
  console.log(`Từ cần xử lý: ${todo.length}`)
  let done = 0
  const batches = levels.flatMap((lv) => chunk(todo.filter((v) => v.level === lv), 20))
  await pool(batches, 8, async (batch) => {
    const level = `N${batch[0].level}`
    const input = batch.map((v) => ({ k: v.key, word: v.word, reading: v.reading, en: v.en.join(' | '), pos: v.pos.slice(0, 2).join(',') }))
    try {
      const res = await chatJSON<{ items: ({ k: string } & VocabInfo)[] }>(cfg, {
        system: SYSTEM.replace('{LEVEL}', level),
        user: JSON.stringify(input),
        temperature: 0.5,
        maxTokens: 6000
      })
      for (const it of res.items ?? []) {
        if (!it?.k || !it.vi || !batch.some((b) => b.key === it.k)) continue
        cache.set(it.k, { vi: it.vi, note: it.note ?? '', ex: it.ex ?? '', exVi: it.exVi ?? '' })
      }
    } catch (e) {
      console.error('Lỗi batch từ vựng:', (e as Error).message)
    }
    done += batch.length
    if (done % 400 < 20) logCost(`vocab ${done}/${todo.length}`)
  })
  logCost('vocab xong')
  console.log(`Đã có ${cache.size}/${vocab.length}`)
}

main()
