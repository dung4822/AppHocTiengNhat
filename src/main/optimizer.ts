/**
 * Tối ưu tham số FSRS theo lịch sử ôn của chính người học,
 * dùng fsrs-rs (cùng lõi Rust mà Anki dùng) qua @open-spaced-repetition/binding.
 */
import { getDb } from './db'
import { getSettings, updateSettings } from './settings'

interface Rev {
  card_id: number
  rating: number
  day: number
}

export async function optimizeParameters(): Promise<{ ok: boolean; message: string; params?: number[]; reviews: number }> {
  const binding = await import('@open-spaced-repetition/binding')
  const rows = getDb()
    .prepare('SELECT card_id, rating, day FROM revlog WHERE rating BETWEEN 1 AND 4 ORDER BY card_id, id')
    .all() as Rev[]
  const byCard = new Map<number, Rev[]>()
  for (const r of rows) (byCard.get(r.card_id) ?? byCard.set(r.card_id, []).get(r.card_id)!).push(r)

  // Giống Anki: mỗi lần ôn (trừ lần đầu) tạo 1 item gồm toàn bộ lịch sử trước đó; delta_t tính theo ngày học.
  const items: InstanceType<typeof binding.FSRSBindingItem>[] = []
  for (const revs of byCard.values()) {
    const reviews: InstanceType<typeof binding.FSRSBindingReview>[] = []
    let prevDay = revs[0].day
    for (let i = 0; i < revs.length; i++) {
      const dt = i === 0 ? 0 : revs[i].day - prevDay
      prevDay = revs[i].day
      reviews.push(new binding.FSRSBindingReview(revs[i].rating, dt))
      if (i > 0) {
        const item = new binding.FSRSBindingItem([...reviews])
        if (item.longTermReviewCnt() > 0) items.push(item)
      }
    }
  }
  if (items.length < 50) {
    return { ok: false, message: `Cần thêm dữ liệu: mới có ${items.length} lượt ôn dài hạn (nên ≥ 400, tối thiểu 50).`, reviews: rows.length }
  }
  const s = getSettings()
  const params = await binding.computeParameters(items, {
    enableShortTerm: true,
    numRelearningSteps: s.relearningSteps.length
  })
  const rounded = params.map((x) => Math.round(x * 10000) / 10000)
  updateSettings({ fsrsParams: rounded })
  return { ok: true, message: `Đã tối ưu từ ${items.length} lượt ôn.`, params: rounded, reviews: rows.length }
}
