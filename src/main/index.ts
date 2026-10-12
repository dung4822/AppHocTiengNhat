import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { BrowserWindow, app, ipcMain, net, protocol, shell } from 'electron'
import { DATA_DIR, AUDIO_DIR, ROOT, ensureDir } from './services/paths'

loadEnv({ path: path.join(ROOT, '.env') })

// Giữ mọi dữ liệu của Electron/Chromium trên ổ D (không ghi vào AppData trên ổ C)
const userData = ensureDir(path.join(DATA_DIR, 'electron'))
app.setPath('userData', userData)
app.setPath('sessionData', userData)
app.setPath('crashDumps', ensureDir(path.join(userData, 'crashes')))
app.setPath('logs', ensureDir(path.join(userData, 'logs')))

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f6f3',
    title: 'Nihongo N3',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  const { openDb, importContent } = await import('./db')
  const { api } = await import('./api')
  const { getSettings } = await import('./settings')
  const { startEngine, stopEngine } = await import('./engine')

  openDb()
  const res = importContent()
  if (res.imported) console.log('Đã nạp nội dung phiên bản', res.version)

  // media://audio/<đường dẫn tương đối trong data/audio>
  protocol.handle('media', (req) => {
    const url = new URL(req.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const abs = path.normalize(path.join(AUDIO_DIR, rel))
    if (!abs.startsWith(AUDIO_DIR)) return new Response('forbidden', { status: 403 })
    return net.fetch(pathToFileURL(abs).toString())
  })

  ipcMain.handle('api', async (_e, method: string, args: unknown[]) => {
    const fn = (api as Record<string, (...a: unknown[]) => unknown>)[method]
    if (!fn) throw new Error(`API không tồn tại: ${method}`)
    return await fn(...args)
  })

  createWindow()
  if (getSettings().autoStartEngine) void startEngine()

  if (process.env.SMOKE_TEST && win) {
    const { runSmoke } = await import('./smoke')
    win.webContents.once('did-finish-load', () => void runSmoke(win!, api as any))
  }

  app.on('before-quit', () => stopEngine())
})

app.on('window-all-closed', () => app.quit())
