import { useSyncExternalStore, type CSSProperties } from 'react'
import kurimanjuImage from '../assets/celebration/kurimanju.webp'
import usagiImage from '../assets/celebration/usagi.webp'
import { IS_WEB_BUILD } from '../platform'
import { getCelebration, subscribeCelebration, type ConfettiPiece } from './store'

// 웹은 우사기, 안드로이드 앱은 쿠리만쥬가 축하해 준다.
const IMAGE = IS_WEB_BUILD ? usagiImage : kurimanjuImage

// 저장 직후 바로 보이도록 미리 받아 둔다.
new Image().src = IMAGE

// 화면 위에 떠 있기만 하고 터치는 아래로 그대로 통과시켜서, 축하가 나오는 동안에도 바로 다음 동작을 할 수 있다.
function CelebrationLayer() {
  const celebration = useSyncExternalStore(subscribeCelebration, getCelebration)

  if (!celebration) return null

  return (
    <div key={celebration.id} className="celebration" role="status" aria-live="polite">
      <div className="celebration-card">
        <div className="confetti" aria-hidden="true">
          {celebration.confetti.map((piece, index) => (
            <ConfettiBit key={index} piece={piece} />
          ))}
        </div>
        <img className="celebration-image" src={IMAGE} alt="" />
        <strong className="celebration-message">{celebration.message}</strong>
        {celebration.subline && <span className="celebration-subline">{celebration.subline}</span>}
      </div>
    </div>
  )
}

function ConfettiBit({ piece }: { piece: ConfettiPiece }) {
  const style = {
    '--dx': `${piece.x}px`,
    '--dy': `${piece.y}px`,
    '--spin': `${piece.rotate}deg`,
    animationDelay: `${piece.delay}ms`,
    background: `var(--slice-${piece.color + 1})`,
  } as CSSProperties

  return <span className={`confetti-bit${piece.isRound ? ' is-round' : ''}`} style={style} />
}

export default CelebrationLayer
