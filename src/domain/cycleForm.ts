import { isLinkValid, type CycleInput } from './cycle'

export const cycleFormError = (draft: CycleInput) => {
  if (draft.name.trim() === '') return '이름을 입력해 주세요'
  if (draft.period && !(draft.period.amount >= 1)) return '주기를 1 이상으로 정해 주세요'
  if (draft.link && !isLinkValid(draft.link)) return '연결할 카테고리나 가맹점을 정해 주세요'
  if (!draft.notify.enabled) return null
  if (draft.period && draft.notify.offsets.length === 0) return '알림 받을 때를 골라 주세요'
  if (!draft.period && !(Number(draft.notify.afterDays) >= 1)) return '며칠 지나면 알릴지 정해 주세요'
  return null
}
