/**
 * Client DeepSeek tối giản (API tương thích OpenAI).
 * Dùng model non-thinking để rẻ nhất; mọi kết quả nên được cache bởi nơi gọi.
 */
export interface DeepSeekConfig {
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface ChatRequest {
  system?: string
  user: string
  json?: boolean
  maxTokens?: number
  temperature?: number
}

export interface Usage {
  promptTokens: number
  cacheHitTokens: number
  completionTokens: number
}

export const usageTotal: Usage = { promptTokens: 0, cacheHitTokens: 0, completionTokens: 0 }

/** Ước tính chi phí USD theo giá Flash giờ thấp điểm/cao điểm (trung bình). */
export function estimateCostUSD(u: Usage = usageTotal): number {
  const miss = u.promptTokens - u.cacheHitTokens
  return (miss * 0.22 + u.cacheHitTokens * 0.0045 + u.completionTokens * 0.9) / 1e6
}

export function configFromEnv(): DeepSeekConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('Thiếu DEEPSEEK_API_KEY trong .env')
  return { apiKey, baseUrl: process.env.DEEPSEEK_BASE_URL }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function chat(cfg: DeepSeekConfig, req: ChatRequest): Promise<string> {
  const body = {
    model: cfg.model ?? 'deepseek-chat',
    messages: [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.user }
    ],
    max_tokens: req.maxTokens ?? 4000,
    temperature: req.temperature ?? 0.7,
    ...(req.json ? { response_format: { type: 'json_object' } } : {})
  }
  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${cfg.baseUrl ?? 'https://api.deepseek.com'}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000)
      })
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`DeepSeek HTTP ${res.status}`)
        await sleep(2000 * (attempt + 1))
        continue
      }
      if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${await res.text()}`)
      const data: any = await res.json()
      const u = data.usage ?? {}
      usageTotal.promptTokens += u.prompt_tokens ?? 0
      usageTotal.cacheHitTokens += u.prompt_cache_hit_tokens ?? 0
      usageTotal.completionTokens += u.completion_tokens ?? 0
      const text: string = data.choices?.[0]?.message?.content ?? ''
      if (!text.trim()) throw new Error('DeepSeek trả về rỗng')
      return text
    } catch (e) {
      lastErr = e
      await sleep(1500 * (attempt + 1))
    }
  }
  throw lastErr
}

/** Gọi chat ở chế độ JSON và parse kết quả (thử lại nếu JSON hỏng). */
export async function chatJSON<T>(cfg: DeepSeekConfig, req: ChatRequest): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < 3; i++) {
    const text = await chat(cfg, { ...req, json: true })
    try {
      return JSON.parse(text) as T
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

/** Chạy các tác vụ async với giới hạn song song. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}
