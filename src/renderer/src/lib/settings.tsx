import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Settings } from '../../../main/settings'
import { call } from './api'

interface Ctx {
  settings: Settings | null
  update: (patch: Partial<Settings>) => Promise<void>
}

const SettingsCtx = createContext<Ctx>({ settings: null, update: async () => {} })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    void call('settings.get').then(setSettings)
  }, [])
  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await call('settings.update', patch))
  }, [])
  return <SettingsCtx.Provider value={{ settings, update }}>{children}</SettingsCtx.Provider>
}

export const useSettings = () => useContext(SettingsCtx)
