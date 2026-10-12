import fs from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { CACHE_DIR, CONTENT_DIR, ROOT, ensureDir } from '../src/main/services/paths'
import { estimateCostUSD, usageTotal } from '../src/main/services/deepseek'

config({ path: path.join(ROOT, '.env') })

/** Cache dạng JSONL: mỗi dòng {k, v}. Ghi nối tiếp nên an toàn khi dừng giữa chừng. */
export class JsonlCache<V> {
  private map = new Map<string, V>()
  private file: string
  constructor(name: string) {
    this.file = path.join(ensureDir(path.join(CACHE_DIR, 'pipeline')), `${name}.jsonl`)
    if (fs.existsSync(this.file)) {
      for (const line of fs.readFileSync(this.file, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try {
          const { k, v } = JSON.parse(line)
          this.map.set(k, v)
        } catch {
          /* bỏ qua dòng hỏng */
        }
      }
    }
  }
  has(k: string) { return this.map.has(k) }
  get(k: string) { return this.map.get(k) }
  set(k: string, v: V) {
    this.map.set(k, v)
    fs.appendFileSync(this.file, JSON.stringify({ k, v }) + '\n')
  }
  get size() { return this.map.size }
}

export function readContent<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'))
}

export function writeContent(name: string, data: unknown) {
  ensureDir(CONTENT_DIR)
  fs.writeFileSync(path.join(CONTENT_DIR, name), JSON.stringify(data))
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export function logCost(label: string) {
  console.log(
    `[${label}] tokens in=${usageTotal.promptTokens} (cache ${usageTotal.cacheHitTokens}) out=${usageTotal.completionTokens} ≈ $${estimateCostUSD().toFixed(3)}`
  )
}
