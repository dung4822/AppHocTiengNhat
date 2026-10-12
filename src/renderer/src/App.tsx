import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { IconBook, IconCards, IconChart, IconExam, IconHeadphones, IconHome, IconPuzzle, IconSettings } from './components/icons'
import { cx } from './components/ui'
import { call } from './lib/api'
import { SettingsProvider, useSettings } from './lib/settings'
import HomePage from './pages/home/HomePage'
import VocabPage from './pages/vocab/VocabPage'
import ListeningPage from './pages/listening/ListeningPage'
import ReadingPage from './pages/reading/ReadingPage'
import GrammarPage from './pages/grammar/GrammarPage'
import JlptPage from './pages/jlpt/JlptPage'
import StatsPage from './pages/stats/StatsPage'
import SettingsPage from './pages/settings/SettingsPage'

const NAV = [
  { to: '/', label: 'Hôm nay', jp: '今日', icon: IconHome },
  { to: '/vocab', label: 'Từ vựng', jp: '語彙', icon: IconCards },
  { to: '/listening', label: 'Nghe', jp: '聴解', icon: IconHeadphones },
  { to: '/reading', label: 'Đọc', jp: '読解', icon: IconBook },
  { to: '/grammar', label: 'Ngữ pháp', jp: '文法', icon: IconPuzzle },
  { to: '/jlpt', label: 'Luyện đề', jp: '模試', icon: IconExam },
  { to: '/stats', label: 'Thống kê', jp: '統計', icon: IconChart }
]

function EngineDot() {
  const [status, setStatus] = useState<string>('…')
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const s = await call('system.status')
      if (alive) setStatus(s.engine)
    }
    void tick()
    const iv = setInterval(tick, 10_000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [])
  const label = { running: 'Giọng đọc sẵn sàng', starting: 'Đang khởi động giọng đọc…', stopped: 'Giọng đọc đang tắt', missing: 'Chưa cài AivisSpeech' }[status] ?? '…'
  return (
    <div className="flex items-center gap-2 px-3 text-xs text-muted" title="AivisSpeech Engine">
      <span className={cx('h-2 w-2 rounded-full', status === 'running' ? 'bg-good' : status === 'starting' ? 'animate-pulse bg-warn' : 'bg-line')} />
      {label}
    </div>
  )
}

function Shell() {
  const { settings } = useSettings()
  useEffect(() => {
    const dark =
      settings?.theme === 'dark' || (settings?.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', !!dark)
  }, [settings?.theme])

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface/60 py-5">
        <div className="mb-6 px-5">
          <div className="jp text-xl font-bold tracking-tight">
            日本語<span className="text-accent">N3</span>
          </div>
          <div className="text-xs text-muted">Học nhanh · khoa học</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx(
                  'group flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition',
                  isActive ? 'bg-ink text-paper' : 'text-muted hover:bg-line/50 hover:text-ink'
                )
              }
            >
              <n.icon size={18} />
              <span className="flex-1">{n.label}</span>
              <span className="jp text-[11px] opacity-50">{n.jp}</span>
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-2 px-3">
          <EngineDot />
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cx('flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition', isActive ? 'bg-ink text-paper' : 'text-muted hover:bg-line/50 hover:text-ink')
            }
          >
            <IconSettings size={18} /> Cài đặt
          </NavLink>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/vocab/*" element={<VocabPage />} />
            <Route path="/listening/*" element={<ListeningPage />} />
            <Route path="/reading/*" element={<ReadingPage />} />
            <Route path="/grammar/*" element={<GrammarPage />} />
            <Route path="/jlpt/*" element={<JlptPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </HashRouter>
  )
}
