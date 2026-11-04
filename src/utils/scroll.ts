let shouldScrollToTop = false

// 저장하고 돌아가는 화면은 보던 위치 대신 맨 위로 간다. 새 기록이 맨 위쪽에 생기기 때문이다.
export const scrollToTopOnReturn = () => {
  shouldScrollToTop = true
}

export const consumeScrollToTop = () => {
  const value = shouldScrollToTop
  shouldScrollToTop = false
  return value
}
