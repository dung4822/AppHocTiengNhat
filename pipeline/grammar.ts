/**
 * Bước 4: Ngữ pháp N5→N3.
 * Danh sách mẫu: grammar-list.ts (biên soạn tay). Với mỗi mẫu: nghĩa, cấu trúc, giải thích, 3 câu ví dụ có đánh dấu phần ngữ pháp để làm thẻ cloze.
 */
import { chatJSON, configFromEnv, pool } from '../src/main/services/deepseek'
import { JsonlCache, chunk, logCost } from './lib'
import { GRAMMAR_LIST } from './grammar-list'

export interface GrammarPoint {
  key: string
  level: number
  pattern: string
  meaning: string
  structure: string
  explain: string
  examples: { jp: string; ans: string; vi: string }[]
}

const DETAIL_SYSTEM = `Bạn là giáo viên tiếng Nhật cho người Việt. Với mỗi mẫu ngữ pháp (phần trong ngoặc （） là ghi chú phân loại, không thuộc mẫu), trả về:
- "meaning": nghĩa tiếng Việt ngắn (≤ 12 từ)
- "structure": cấu trúc kết hợp, VD "Vて + しまう" hoặc "N + の + ために"
- "explain": giải thích 2–3 câu tiếng Việt: khi nào dùng, sắc thái, so sánh với mẫu dễ nhầm.
- "examples": đúng 3 câu ví dụ tự nhiên, ngắn (≤ 25 ký tự), từ vựng ở mức {LEVEL} trở xuống, viết kanji bình thường như người Nhật. Mỗi câu: {"jp": câu đầy đủ, "ans": phần chữ của mẫu ngữ pháp xuất hiện NGUYÊN VĂN trong jp (để che đi khi ôn), "vi": dịch tiếng Việt}.
Trả về JSON: {"items":[{"p":"<mẫu>","meaning":"...","structure":"...","explain":"...","examples":[...]}]}`

async function main() {
  const cfg = configFromEnv()
  const detailCache = new JsonlCache<Omit<GrammarPoint, 'key' | 'level' | 'pattern'>>('grammar2')

  const levels = [5, 4, 3]
  const all: { key: string; level: number; pattern: string }[] = []
  for (const lv of levels) for (const p of GRAMMAR_LIST[lv]) all.push({ key: `N${lv}:${p}`, level: lv, pattern: p })
  const todo = all.filter((g) => !detailCache.has(g.key))
  console.log(`Tổng ${all.length} mẫu, cần chi tiết: ${todo.length}`)
  const batches = levels.flatMap((lv) => chunk(todo.filter((g) => g.level === lv), 6))
  await pool(batches, 8, async (batch) => {
    try {
      const res = await chatJSON<{ items: any[] }>(cfg, {
        system: DETAIL_SYSTEM.replace('{LEVEL}', `N${batch[0].level}`),
        user: JSON.stringify(batch.map((g) => g.pattern)),
        temperature: 0.4,
        maxTokens: 6000
      })
      res.items?.forEach((it, i) => {
        const g = batch.find((b) => b.pattern === it.p) ?? batch[i]
        if (!g || !it.meaning) return
        const examples = (it.examples ?? []).filter((e: any) => e?.jp && e?.ans && e.jp.includes(e.ans))
        detailCache.set(g.key, { meaning: it.meaning, structure: it.structure ?? '', explain: it.explain ?? '', examples })
      })
    } catch (e) {
      console.error('Lỗi batch ngữ pháp:', (e as Error).message)
    }
  })
  logCost('grammar xong')
  console.log(`Chi tiết: ${detailCache.size}/${all.length}`)
}

main()
