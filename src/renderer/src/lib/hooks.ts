import { useCallback, useEffect, useRef, useState } from 'react'
import { call } from './api'
import { onPlaying } from './audio'

/** Tải dữ liệu async, có reload(). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fnRef.current())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error, loading, reload, setData }
}

type Module = 'vocab' | 'listening' | 'reading' | 'grammar' | 'jlpt'

/**
 * Đếm thời gian học thật của một module: chỉ tính khi cửa sổ đang focus
 * và có thao tác trong 90 giây gần nhất (hoặc đang phát audio).
 */
export function useStudyTimer(module: Module, active = true) {
  useEffect(() => {
    if (!active) return
    let last = Date.now()
    let lastActivity = Date.now()
    let playing = false
    const bump = () => (lastActivity = Date.now())
    const off = onPlaying((p) => {
      playing = p
      bump()
    })
    window.addEventListener('keydown', bump)
    window.addEventListener('mousedown', bump)
    window.addEventListener('mousemove', bump)
    window.addEventListener('wheel', bump)
    const flush = () => {
      const now = Date.now()
      const sec = (now - last) / 1000
      last = now
      if (document.hasFocus() && (playing || now - lastActivity < 90_000)) void call('study.tick', module, sec)
    }
    const iv = setInterval(flush, 15_000)
    return () => {
      flush()
      clearInterval(iv)
      off()
      window.removeEventListener('keydown', bump)
      window.removeEventListener('mousedown', bump)
      window.removeEventListener('mousemove', bump)
      window.removeEventListener('wheel', bump)
    }
  }, [module, active])
}

/** Phím tắt; bỏ qua khi đang gõ trong ô nhập. */
export function useKeys(map: Record<string, (e: KeyboardEvent) => void>, deps: unknown[] = []) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const key = (e.ctrlKey ? 'ctrl+' : '') + (e.key.length === 1 ? e.key.toLowerCase() : e.key)
      const fn = map[key] ?? map[e.code]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
