import type { CycleInput } from './cycle'

export const cycleFormError = (draft: CycleInput) => {
  if (draft.name.trim() === '') return '이름을 입력해 주세요'
  if (draft.period && !(draft.period.amount >= 1)) return '주기를 1 이상으로 정해 주세요'
  return null
}
