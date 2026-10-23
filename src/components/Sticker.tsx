import { IS_WEB_BUILD } from '../platform'

export type StickerName =
  | 'default'
  | 'peek'
  | 'proud'
  | 'thinking'
  | 'victory'
  | 'dance'
  | 'done'
  | 'celebrate'
  | 'cry'
  | 'puzzled'
  | 'excited'
  | 'eat'

// 웹은 우사기 전용, 안드로이드 앱은 쿠리만쥬 위주로 꾸민다.
const CHARACTER = IS_WEB_BUILD ? 'usagi' : 'kurimanju'

const stickerModules = import.meta.glob<string>('../assets/stickers/*/*.webp', { eager: true, import: 'default' })

const STICKERS = Object.fromEntries(
  Object.entries(stickerModules)
    .filter(([path]) => path.includes(`/stickers/${CHARACTER}/`))
    .map(([path, url]) => [path.split('/').pop()!.replace('.webp', ''), url]),
) as Partial<Record<StickerName, string>>

// 캐릭터마다 가진 이미지가 달라서, 없으면 비슷한 표정으로 대신한다.
const FALLBACK: Partial<Record<StickerName, StickerName>> = {
  proud: 'thinking',
  thinking: 'proud',
  victory: 'default',
  excited: 'celebrate',
  done: 'dance',
  celebrate: 'dance',
  puzzled: 'cry',
}

const resolve = (name: StickerName) => STICKERS[name] ?? STICKERS[FALLBACK[name] ?? 'default'] ?? STICKERS.default

type StickerProps = {
  name: StickerName
  size: number
  className?: string
}

function Sticker({ name, size, className = '' }: StickerProps) {
  return <img className={`sticker ${className}`} src={resolve(name)} alt="" width={size} height={size} />
}

export default Sticker
