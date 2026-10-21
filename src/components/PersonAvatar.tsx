import type { Person } from '../domain/types'

const PERSON_EMOJI: Record<Person, string> = {
  쿠리만쥬: '🌰',
  우사기: '🐰',
}

const imageModules = import.meta.glob<string>('../assets/people/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const PERSON_IMAGE = Object.fromEntries(
  Object.entries(imageModules).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]),
) as Partial<Record<Person, string>>

type PersonAvatarProps = {
  person: Person
  size?: number
}

function PersonAvatar({ person, size = 20 }: PersonAvatarProps) {
  const image = PERSON_IMAGE[person]

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
