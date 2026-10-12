import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db'
import { AUDIO_DIR } from '../services/paths'
import { type SynthOptions, audioRelPath, engineAlive, synthToFile } from '../services/tts'
import type { Seg } from '../services/furigana'
import { getSettings } from '../settings'

export interface VocabNote {
  id: number
  key: string
  word: string
  reading: string
  level: number
  rank: number
  vi: string
  note: string
  en: string[]
  pos: string[]
  pitch: number[] | null
  kanji: string[]
  furi: Seg[]
  ex: string
  exVi: string
  exFuri: Seg[]
  audio: string
  exAudio: string
  custom: number
}

export interface KanjiInfo {
  char: string
  hv: string
  vi: string
  mn: string
  en: string[]
  on: string[]
  kun: string[]
  strokes: number
  level: number
}

const j = <T>(s: string | null | undefined, d: T): T => {
  if (!s) return d
  try {
    return JSON.parse(s) as T
  } catch {
    return d
  }
}

export function parseVocab(r: any): VocabNote {
  return {
    id: r.id,
    key: r.key,
    word: r.word,
    reading: r.reading,
    level: r.level,
    rank: r.rank,
    vi: r.vi ?? '',
    note: r.note ?? '',
    en: j(r.en, []),
    pos: j(r.pos, []),
    pitch: j(r.pitch, null),
    kanji: j(r.kanji, []),
    furi: j(r.furi, [{ t: r.word }]),
    ex: r.ex ?? '',
    exVi: r.ex_vi ?? '',
    exFuri: j(r.ex_furi, []),
    audio: r.audio ?? '',
    exAudio: r.ex_audio ?? '',
    custom: r.custom ?? 0
  }
}

export function parseKanji(r: any): KanjiInfo {
  return {
    char: r.char,
    hv: r.hv ?? '',
    vi: r.vi ?? '',
    mn: r.mn ?? '',
    en: j(r.en, []),
    on: j(r.on_r, []),
    kun: j(r.kun_r, []),
    strokes: r.strokes ?? 0,
    level: r.level ?? 0
  }
}

export function getVocab(id: number): VocabNote | null {
  const r = getDb().prepare('SELECT * FROM vocab WHERE id = ?').get(id)
  return r ? parseVocab(r) : null
}

export function getKanjiMany(chars: string[]): KanjiInfo[] {
  if (!chars.length) return []
  const rows = getDb()
    .prepare(`SELECT * FROM kanji WHERE char IN (${chars.map(() => '?').join(',')})`)
    .all(...chars)
  const map = new Map(rows.map((r: any) => [r.char, parseKanji(r)]))
  return chars.map((c) => map.get(c)).filter(Boolean) as KanjiInfo[]
}

export const parseJSON = j

// ---------------------------------------------------------------- Audio theo yêu cầu

const inflight = new Map<string, Promise<string | null>>()

/**
 * Trả về đường dẫn audio (tương đối trong data/audio). Nếu chưa có file thì sinh ngay bằng AivisSpeech.
 * Trả null nếu engine chưa chạy.
 */
export async function ensureAudio(text: string, opts: SynthOptions = {}): Promise<string | null> {
  if (!text?.trim()) return null
  const s = getSettings()
  const speaker = opts.speaker ?? s.speaker
  const rel = audioRelPath(text, speaker, opts.accent ?? null, opts.speed ?? 1)
  const abs = path.join(AUDIO_DIR, rel)
  if (fs.existsSync(abs)) return rel
  if (inflight.has(rel)) return inflight.get(rel)!
  const p = (async () => {
    if (!(await engineAlive())) return null
    try {
      await synthToFile(text, abs, { ...opts, speaker })
      return rel
    } catch (e) {
      console.warn('TTS lỗi:', (e as Error).message)
      return null
    } finally {
      inflight.delete(rel)
    }
  })()
  inflight.set(rel, p)
  return p
}
