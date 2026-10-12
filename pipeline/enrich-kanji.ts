/**
 * Bước 2: DeepSeek bổ sung cho kanji: âm Hán Việt chính, nghĩa tiếng Việt, mẹo nhớ.
 * Unihan được dùng làm gợi ý để giảm sai sót.
 */
import { chatJSON, configFromEnv, pool } from '../src/main/services/deepseek'
import type { BaseKanji } from './base'
import { JsonlCache, chunk, logCost, readContent } from './lib'

export interface KanjiInfo {
  hv: string
  vi: string
  mn: string
}

const SYSTEM = `Bạn là chuyên gia Hán Việt và tiếng Nhật, viết cho người Việt học tiếng Nhật.
Với mỗi chữ kanji, trả về:
- "hv": âm Hán Việt CHÍNH viết HOA có dấu (VD: "KINH"). Nếu có 2 âm phổ biến khác nghĩa thì "HÀNH/HÀNG". Ưu tiên âm khớp với nghĩa dùng trong tiếng Nhật. Có gợi ý từ Unihan (có thể rỗng hoặc chưa sắp xếp).
- "vi": nghĩa tiếng Việt ngắn gọn (≤ 6 từ).
- "mn": mẹo nhớ 1 câu ngắn (≤ 20 từ) dựa vào các bộ phận cấu tạo chữ và nghĩa Hán Việt. Không bịa bộ phận không có.
Trả về JSON: {"items":[{"c":"<chữ>","hv":"...","vi":"...","mn":"..."}]}`

async function main() {
  const cfg = configFromEnv()
  const kanji = readContent<BaseKanji[]>('base-kanji.json')
  const cache = new JsonlCache<KanjiInfo>('kanji')
  const todo = kanji.filter((k) => !cache.has(k.char))
  console.log(`Kanji cần xử lý: ${todo.length}/${kanji.length}`)
  let done = 0
  await pool(chunk(todo, 40), 6, async (batch) => {
    const input = batch.map((k) => ({ c: k.char, unihan: k.hvCandidates.join(' '), en: k.en.slice(0, 3).join('; '), on: k.on.join(' ') }))
    try {
      const res = await chatJSON<{ items: ({ c: string } & KanjiInfo)[] }>(cfg, {
        system: SYSTEM,
        user: JSON.stringify(input),
        temperature: 0.3,
        maxTokens: 6000
      })
      for (const it of res.items ?? []) {
        if (!it?.c || !it.hv) continue
        if (batch.some((b) => b.char === it.c)) cache.set(it.c, { hv: it.hv.toUpperCase(), vi: it.vi ?? '', mn: it.mn ?? '' })
      }
    } catch (e) {
      console.error('Lỗi batch kanji:', (e as Error).message)
    }
    done += batch.length
    if (done % 200 < 40) logCost(`kanji ${done}/${todo.length}`)
  })
  logCost('kanji xong')
  console.log(`Đã có ${cache.size}/${kanji.length}`)
}

main()
