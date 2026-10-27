import kurimanjuHead from '../assets/avatar/kurimanju-head.webp'
import usagiEars from '../assets/avatar/usagi-ears.webp'
import type { Person } from '../domain/types'

type AvatarTarget = Person | '공동'

const PERSON_EMOJI: Record<AvatarTarget, string> = {
  쿠리만쥬: '🌰',
  우사기: '🐰',
  공동: '👫',
}

const imageModules = import.meta.glob<string>('../assets/people/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const PERSON_IMAGE = Object.fromEntries(
  Object.entries(imageModules).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]),
) as Partial<Record<AvatarTarget, string>>

type PersonAvatarProps = {
  person: AvatarTarget
  size?: number
}

function PersonAvatar({ person, size = 20 }: PersonAvatarProps) {
  const image = PERSON_IMAGE[person]

  // 우사기는 동그란 얼굴 위로 귀만 살짝 튀어나오게 해서, 원 안에 잘리지 않고 우사기답게 보이게 한다.
  if (image && person === '우사기') {
    return (
      <span className="avatar avatar-with-ears" style={{ width: size, height: size }}>
        <img className="avatar-face" src={image} alt="" width={size} height={size} />
        <img className="avatar-ears" src={usagiEars} alt="" style={{ width: size * 0.46, left: size * 0.18, top: -size * 0.36 }} />
      </span>
    )
  }
  // 쿠리만쥬는 머리가 원래 동그라니, 배경을 지운 머리 그림을 그대로 써서 밤 모자와 귀가 잘리지 않게 한다.
  if (person === '쿠리만쥬') {
    return <img className="avatar avatar-cutout" src={kurimanjuHead} alt="" width={size} height={size} />
  }
  if (image) {
    return <img className="avatar" src={image} alt="" width={size} height={size} />
  }
  return (
    <span className="avatar avatar-emoji" style={{ width: size, height: size, fontSize: size * 0.72 }} aria-hidden="true">
      {PERSON_EMOJI[person]}
    </span>
  )
}

export default PersonAvatar
