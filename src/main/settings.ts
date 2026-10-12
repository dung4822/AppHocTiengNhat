import { getDb } from './db'

/** Cấu hình mặc định — các giá trị lập lịch giống mặc định của Anki (FSRS). */
export const DEFAULT_SETTINGS = {
  // --- Lập lịch (giống Anki) ---
  desiredRetention: 0.9,
  maximumInterval: 36500,
  learningSteps: ['1m', '10m'] as string[],
  relearningSteps: ['10m'] as string[],
  fsrsParams: null as number[] | null, // null = tham số mặc định FSRS-6
  enableFuzz: true,
  loadBalancer: true,
  leechThreshold: 8,
  dayStartHour: 4,
  burySiblings: true,
  learnAheadMinutes: 20,
  maxReviewsPerDay: 9999,

  // --- Thẻ mới ---
  autoNewByBudget: true, // tự tính số thẻ mới theo ngân sách thời gian
  newPerDay: 30, // dùng khi autoNewByBudget = false (tính cả thẻ nghe)
  maxAutoNewPerDay: 50,
  listeningCards: true, // bật thẻ nghe (mở sau khi thẻ nhận diện đã thuộc)
  grammarNewPerDay: 3,

  // --- Ngân sách thời gian mỗi ngày (phút) ---
  budget: { vocab: 80, listening: 45, reading: 35, grammar: 20 } as Record<string, number>,

  // --- Giao diện & âm thanh ---
  autoplayAudio: true,
  autoplayExample: false,
  speaker: 888753760,
  speaker2: 1878365376,
  readingFurigana: 'unknown' as 'all' | 'unknown' | 'none',
  theme: 'system' as 'system' | 'light' | 'dark',
  autoStartEngine: true
}

export type Settings = typeof DEFAULT_SETTINGS

let cached: Settings | null = null

export function getSettings(): Settings {
  if (cached) return cached
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const s: any = structuredClone(DEFAULT_SETTINGS)
  for (const r of rows) {
    try {
      s[r.key] = JSON.parse(r.value)
    } catch {
      /* bỏ qua */
    }
  }
  cached = s
  return s
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const stmt = getDb().prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v))
  cached = null
  return getSettings()
}
