import { ensureAudio } from './common'
import { contentApi } from './content'
import { jlptApi } from './jlpt'
import { srsApi } from './srs'
import { statsApi } from './stats'
import { vocabApi } from './vocab'

const ttsApi = {
  /** Lấy (hoặc sinh) audio cho văn bản; trả về đường dẫn tương đối để phát qua media:// */
  'tts.ensure'(text: string, accent?: number | null, speaker?: number) {
    return ensureAudio(text, { accent: accent ?? null, ...(speaker ? { speaker } : {}) })
  }
}

export const api = {
  ...srsApi,
  ...vocabApi,
  ...contentApi,
  ...jlptApi,
  ...statsApi,
  ...ttsApi
}

export type Api = typeof api
