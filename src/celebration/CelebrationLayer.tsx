import { useSyncExternalStore } from 'react'
import kurimanjuImage from '../assets/celebration/kurimanju.webp'
import usagiImage from '../assets/celebration/usagi.webp'
import { IS_WEB_BUILD } from '../platform'
import { getCelebration, subscribeCelebration } from './store'

// 웹은 우사기, 안드로이드 앱은 쿠리만쥬가 축하해 준다.
const IMAGE = IS_WEB_BUILD ? usagiImage : kurimanjuImage

// 저장 직후 바로 보이도록 미리 받아 둔다.
new Image().src = IMAGE

// 화면 아래에 잠깐 떠 있는 알림. 터치는 아래로 그대로 통과시켜서, 나오는 동안에도 바로 다음 동작을 할 수 있다.
function CelebrationLayer() {
  const celebration = useSyncExternalStore(subscribeCelebration, getCelebration)

  if (!celebration) return null

  return (
    <div key={celebration.id} className="celebration" role="status" aria-live="polite">
      <div className="celebration-toast">
        <img className="celebration-image" src={IMAGE} alt="" />
        <div className="celebration-text">
          <strong className="celebration-title">{celebration.title}</strong>
          <span className="celebration-subline">{celebration.subline}</span>
        </div>
      </div>
    </div>
  )
}

export default CelebrationLayer
