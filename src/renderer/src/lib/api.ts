import type { Api } from '../../../main/api'

declare global {
  interface Window {
    bridge: { call: (method: string, ...args: unknown[]) => Promise<unknown> }
  }
}

/** Gọi API phía main có kiểu: call('srs.next', 'vocab') */
export function call<K extends keyof Api>(method: K, ...args: Parameters<Api[K]>): Promise<Awaited<ReturnType<Api[K]>>> {
  return window.bridge.call(method, ...args) as Promise<Awaited<ReturnType<Api[K]>>>
}

export type ApiResult<K extends keyof Api> = Awaited<ReturnType<Api[K]>>
