import path from 'node:path'
import fs from 'node:fs'

/**
 * Mọi dữ liệu (DB, audio, nội dung, cache) đều nằm trong <root>/data trên ổ D.
 * Root = thư mục dự án (chứa package.json).
 */
function findRoot(): string {
  if (process.env.APP_ROOT) return process.env.APP_ROOT
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir
    dir = path.dirname(dir)
  }
  return process.cwd()
}

export const ROOT = findRoot()
export const DATA_DIR = path.join(ROOT, 'data')
export const RAW_DIR = path.join(DATA_DIR, 'raw')
export const CONTENT_DIR = path.join(DATA_DIR, 'content')
export const AUDIO_DIR = path.join(DATA_DIR, 'audio')
export const CACHE_DIR = path.join(DATA_DIR, 'cache')
export const DB_PATH = path.join(DATA_DIR, process.env.SMOKE_TEST ? 'smoke.db' : 'nihongo.db')
export const TOOLS_DIR = path.join(ROOT, 'tools')

export function ensureDir(p: string): string {
  fs.mkdirSync(p, { recursive: true })
  return p
}
