/**
 * Quản lý AivisSpeech Engine: tự khởi động khi mở app (nếu chưa chạy), tắt khi thoát.
 * Dữ liệu engine (model giọng ~1GB) được trỏ sang ổ D bằng junction.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, TOOLS_DIR, ensureDir } from './services/paths'
import { engineAlive } from './services/tts'

let child: ChildProcess | null = null
let starting = false

const ENGINE_DIR = path.join(TOOLS_DIR, 'aivis', 'Windows-x64')

export type EngineStatus = 'running' | 'starting' | 'stopped' | 'missing'

export async function engineStatus(): Promise<EngineStatus> {
  if (await engineAlive()) return 'running'
  if (!fs.existsSync(path.join(ENGINE_DIR, 'run.exe'))) return 'missing'
  return starting ? 'starting' : 'stopped'
}

function ensureJunction() {
  const appData = process.env.APPDATA
  if (!appData) return
  const link = path.join(appData, 'AivisSpeech-Engine')
  const target = ensureDir(path.join(DATA_DIR, 'aivis-engine'))
  if (!fs.existsSync(link)) {
    try {
      fs.symlinkSync(target, link, 'junction')
    } catch (e) {
      console.warn('Không tạo được junction cho AivisSpeech:', (e as Error).message)
    }
  }
}

export async function startEngine(gpu = false): Promise<EngineStatus> {
  if (await engineAlive()) return 'running'
  if (!fs.existsSync(path.join(ENGINE_DIR, 'run.exe'))) return 'missing'
  if (starting) return 'starting'
  ensureJunction()
  starting = true
  const log = fs.openSync(path.join(DATA_DIR, 'aivis-engine.log'), 'w')
  child = spawn(path.join(ENGINE_DIR, 'run.exe'), [...(gpu ? ['--use_gpu'] : []), '--output_log_utf8', '--port', '10101'], {
    cwd: ENGINE_DIR,
    windowsHide: true,
    stdio: ['ignore', log, log]
  })
  child.on('exit', () => {
    child = null
    starting = false
  })
  // Chờ tối đa 3 phút cho engine nạp model
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    if (await engineAlive()) {
      starting = false
      return 'running'
    }
    if (!child) break
  }
  starting = false
  return (await engineAlive()) ? 'running' : 'stopped'
}

export function stopEngine() {
  if (child) {
    child.kill()
    child = null
  }
}
