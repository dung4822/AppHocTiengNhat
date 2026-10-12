import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bridge', {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('api', method, args)
})
