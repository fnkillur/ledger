import { IS_WEB_BUILD } from '../platform'

export type StickerName = 'default' | 'peek' | 'proud' | 'victory' | 'dance' | 'jump' | 'cry' | 'excited' | 'eat'

// 웹은 우사기 전용, 안드로이드 앱은 쿠리만쥬 위주로 꾸민다.
const CHARACTER = IS_WEB_BUILD ? 'usagi' : 'kurimanju'

const stickerModules = import.meta.glob<string>('../assets/stickers/*/*.webp', { eager: true, import: 'default' })

const STICKERS = Object.fromEntries(
  Object.entries(stickerModules)
    .filter(([path]) => path.includes(`/stickers/${CHARACTER}/`))
    .map(([path, url]) => [path.split('/').pop()!.replace('.webp', ''), url]),
)

// 쿠리만쥬는 이미지가 적어서 비슷한 표정으로 대신한다.
const FALLBACK: Partial<Record<StickerName, StickerName>> = {
  proud: 'default',
  victory: 'default',
  excited: 'dance',
}

const resolve = (name: StickerName) => STICKERS[name] ?? STICKERS[FALLBACK[name] ?? 'default']

type StickerProps = {
  name: StickerName
  size: number
  className?: string
}

function Sticker({ name, size, className = '' }: StickerProps) {
  return <img className={`sticker ${className}`} src={resolve(name)} alt="" width={size} height={size} />
}

export default Sticker
