import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './paths'

/**
 * AivisSpeech Engine (API tương thích VOICEVOX) chạy local ở cổng 10101.
 * Audio được sinh một lần rồi lưu thành .ogg (Opus) để học offline, không tốn phí.
 */
export const AIVIS_URL = process.env.AIVIS_URL ?? 'http://127.0.0.1:10101'

/** Hai giọng mặc định của AivisSpeech: まお (nữ) và コハク (nam). */
export const VOICES = { female: 888753760, male: 1878365376 }

let lastAlive = 0

/** Engine có đang chạy không (khi đang bận tổng hợp giọng, /version có thể trả chậm). */
export async function engineAlive(): Promise<boolean> {
  if (Date.now() - lastAlive < 15_000) return true
  try {
    const r = await fetch(`${AIVIS_URL}/version`, { signal: AbortSignal.timeout(8000) })
    if (r.ok) lastAlive = Date.now()
    return r.ok
  } catch {
    return false
  }
}

export interface SynthOptions {
  speaker?: number
  speed?: number
  /** Pitch accent kiểu Kanjium: 0 = heiban, n = rơi sau mora thứ n. Chỉ áp dụng cho từ đơn. */
  accent?: number | null
}

export async function synthWav(text: string, opts: SynthOptions = {}): Promise<Buffer> {
  const speaker = opts.speaker ?? VOICES.female
  const q = await fetch(
    `${AIVIS_URL}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
    { method: 'POST', signal: AbortSignal.timeout(60_000) }
  )
  if (!q.ok) throw new Error(`audio_query ${q.status}`)
  const query: any = await q.json()
  query.speedScale = opts.speed ?? 1
  query.prePhonemeLength = 0.1
  query.postPhonemeLength = 0.15
  query.outputSamplingRate = 24000
  query.outputStereo = false
  if (opts.accent != null && query.accent_phrases?.length === 1) {
    const ap = query.accent_phrases[0]
    const n = ap.moras.length
    const a = opts.accent === 0 ? n : opts.accent
    if (a >= 1 && a <= n) ap.accent = a
  }
  const s = await fetch(`${AIVIS_URL}/synthesis?speaker=${speaker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(120_000)
  })
  if (!s.ok) throw new Error(`synthesis ${s.status}`)
  return Buffer.from(await s.arrayBuffer())
}

function ffmpegPath(): string {
  return path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
}

/** Chuyển WAV -> Ogg Opus (nhỏ ~10 lần). */
export function wavToOgg(wav: Buffer, outPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', outPath
    ])
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))))
    // ffmpeg có thể thoát sớm (bị tắt) → tránh lỗi "write EOF" làm sập cả tiến trình
    p.stdin.on('error', reject)
    p.stdin.end(wav)
  })
}

/** Tên file audio ổn định theo nội dung (dùng chung cho pipeline và app). */
export function audioRelPath(text: string, speaker: number = VOICES.female, accent?: number | null, speed = 1): string {
  const h = createHash('sha1').update(`${speaker}|${accent ?? ''}|${speed}|${text}`).digest('hex').slice(0, 16)
  return `tts/${h.slice(0, 2)}/${h}.ogg`
}

export async function synthToFile(text: string, outPath: string, opts: SynthOptions = {}) {
  const wav = await synthWav(text, opts)
  await wavToOgg(wav, outPath)
}
