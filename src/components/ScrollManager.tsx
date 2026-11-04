import { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router'
import { consumeScrollToTop } from '../utils/scroll'

// 목록이 다 불러와져야 원래 위치까지 내려갈 수 있어서, 높이가 모자라면 몇 프레임 더 시도한다.
const MAX_RESTORE_FRAMES = 60

const positions = new Map<string, number>()

// 새 화면은 맨 위에서 시작하고, 뒤로 돌아온 화면은 보던 위치로 되돌린다.
function ScrollManager() {
  const location = useLocation()
  const navigationType = useNavigationType()

  const currentKey = useRef(location.key)

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
    const remember = () => positions.set(currentKey.current, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [])

  useLayoutEffect(() => {
    currentKey.current = location.key
    const target = !consumeScrollToTop() && navigationType === 'POP' ? (positions.get(location.key) ?? 0) : 0
    let frame = 0
    let requestId = 0
    const restore = () => {
      window.scrollTo(0, target)
      if (Math.abs(window.scrollY - target) > 1 && frame++ < MAX_RESTORE_FRAMES) requestId = requestAnimationFrame(restore)
    }
    restore()
    return () => cancelAnimationFrame(requestId)
  }, [location.key, navigationType])

  return <Outlet />
}

export default ScrollManager
