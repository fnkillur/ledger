import type { SheetCapture } from '../db/captures'
import type { Category, Rule, Transaction } from '../domain/types'
import type { Settings } from './settings'

type PullResponse = {
  serverTime: string
  transactions: Transaction[]
  rules: Rule[]
  categories: Category[]
  settings?: Record<string, number | string>
  captures?: SheetCapture[]
}

type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string }

const unwrap = async <T>(response: Response) => {
  if (!response.ok) throw new Error(`시트 서버 응답 오류 (${response.status})`)
  const result = (await response.json()) as ApiResult<T>
  if (!result.ok) throw new Error(result.error)
  return result
}

export const pull = async (settings: Settings, since: string) => {
  const url = new URL(settings.endpoint)
  url.searchParams.set('action', 'pull')
  url.searchParams.set('token', settings.token)
  if (since) url.searchParams.set('since', since)
  return unwrap<PullResponse>(await fetch(url))
}

// Apps Script는 CORS 사전 요청(OPTIONS)을 처리하지 못해서 text/plain으로 보낸다.
export const push = async (
  settings: Settings,
  payload: { transactions: Transaction[]; rules: Rule[]; settings?: Record<string, number | string>; captures?: { key: string; status: string }[] },
) =>
  unwrap<{ serverTime: string }>(
    await fetch(settings.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: settings.token, action: 'push', ...payload }),
    }),
  )
