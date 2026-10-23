import { PEOPLE, type Person } from './types'

export type Nicknames = Partial<Record<Person, string>>

export const NICKNAME_MAX_LENGTH = 10

// 내역의 사람 값(쿠리만쥬/우사기)은 시트와 연결된 키라 그대로 두고, 화면에 보이는 이름만 바꾼다.
const nicknameKey = (person: Person) => `닉네임_${person}`

// 예전 시트 서버는 설정 값을 숫자로 바꿔 저장해서 닉네임이 0으로 돌아올 수 있으므로 숫자만 있는 값은 버린다.
export const cleanNickname = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, NICKNAME_MAX_LENGTH)
  if (trimmed === '' || /^\d+$/.test(trimmed)) return undefined
  return trimmed
}

export const nicknamesFromSettings = (settings: Record<string, unknown>): Nicknames =>
  Object.fromEntries(
    PEOPLE.flatMap(person => {
      const nickname = cleanNickname(settings[nicknameKey(person)])
      return nickname ? [[person, nickname]] : []
    }),
  )

export const nicknamesToSettings = (nicknames: Nicknames) => Object.fromEntries(PEOPLE.map(person => [nicknameKey(person), nicknames[person] ?? '']))

export const displayName = (person: Person, nicknames: Nicknames) => nicknames[person] ?? person
