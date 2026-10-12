import { call } from './api'

/**
 * Trình phát audio dùng chung: tự sinh audio (AivisSpeech) nếu chưa có file.
 * Chỉ phát một âm thanh tại một thời điểm.
 */
let current: HTMLAudioElement | null = null
let rate = 1
let token = 0
const listeners = new Set<(playing: boolean) => void>()

export function setRate(r: number) {
  rate = r
  if (current) current.playbackRate = r
}
export const getRate = () => rate

export function onPlaying(fn: (playing: boolean) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = (p: boolean) => listeners.forEach((l) => l(p))

export function stopAudio() {
  token++
  if (current) {
    current.pause()
    current = null
  }
  emit(false)
}

export const mediaUrl = (rel: string) => `media://audio/${rel}`

export interface PlayOpts {
  accent?: number | null
  /** tốc độ riêng cho lần phát này (VD 0.7 = nghe chậm) */
  rate?: number
  speaker?: number
  /** dùng khi nhiều câu trong bài nghe: giọng theo vai */
  role?: 'A' | 'B'
}

/** Lấy đường dẫn audio (sinh nếu cần). */
export async function resolveAudio(text: string, opts: PlayOpts = {}): Promise<string | null> {
  if (opts.role) return call('passage.audio', text, opts.role)
  return call('tts.ensure', text, opts.accent ?? null, opts.speaker)
}

/** Phát văn bản; Promise kết thúc khi phát xong (hoặc bị dừng). Trả về false nếu không phát được. */
export async function playText(text: string, opts: PlayOpts = {}): Promise<boolean> {
  stopAudio()
  const my = ++token
  const rel = await resolveAudio(text, opts)
  if (!rel || my !== token) return false
  return playUrl(mediaUrl(rel), my, opts.rate)
}

function playUrl(url: string, my: number, r?: number): Promise<boolean> {
  return new Promise((resolve) => {
    const a = new Audio(url)
    a.preservesPitch = true
    a.playbackRate = r ?? rate
    current = a
    emit(true)
    const done = (ok: boolean) => {
      if (current === a) {
        current = null
        emit(false)
      }
      resolve(ok)
    }
    a.onended = () => done(my === token)
    a.onerror = () => done(false)
    a.onpause = () => {
      if (!a.ended) done(false)
    }
    a.play().catch(() => done(false))
  })
}

/** Phát lần lượt nhiều câu; dừng nếu bị stopAudio(). */
export async function playSequence(items: { text: string; opts?: PlayOpts; gapMs?: number }[], onIndex?: (i: number) => void) {
  const my = ++token
  for (let i = 0; i < items.length; i++) {
    if (my !== token) return
    onIndex?.(i)
    const rel = await resolveAudio(items[i].text, items[i].opts)
    if (my !== token) return
    if (rel) await playUrl(mediaUrl(rel), my)
    if (my !== token) return
    await new Promise((r) => setTimeout(r, items[i].gapMs ?? 500))
  }
  onIndex?.(-1)
}
