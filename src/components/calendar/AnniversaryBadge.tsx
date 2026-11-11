import { HeartIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useAnniversaries } from '../../db/hooks'
import { daysTogether, nextAnniversary, type Anniversaries } from '../../domain/anniversary'
import RingIcon from './RingIcon'

const formatDays = (days: number) => `${days.toLocaleString('ko-KR')}일`

const formatDate = (dateKey: string) => `${Number(dateKey.slice(0, 4))}. ${Number(dateKey.slice(5, 7))}. ${Number(dateKey.slice(8, 10))}.`

const daysLeftText = (daysLeft: number) => (daysLeft === 0 ? '오늘' : `${daysLeft}일 남음`)

const KINDS: { key: keyof Anniversaries; label: string; className: string; icon: (size: number) => React.ReactNode }[] = [
  { key: '사귄날', label: '사귄 지', className: 'is-together', icon: size => <HeartIcon size={size} weight="fill" aria-hidden="true" /> },
  { key: '결혼한날', label: '결혼', className: 'is-married', icon: size => <RingIcon size={size} /> },
]

// 캘린더 머리 오른쪽에 늘 보이는 두 사람의 날수. 누르면 날짜와 다음 기념일을 펼친다. 설정에서 넣은 날짜만 보인다.
function AnniversaryBadge({ todayKey }: { todayKey: string }) {
  const anniversaries = useAnniversaries()

  const [isOpen, setIsOpen] = useState(false)

  const rows = KINDS.flatMap(kind => {
    const startKey = anniversaries[kind.key]
    return startKey ? [{ ...kind, startKey, days: daysTogether(startKey, todayKey) }] : []
  })
  const next = nextAnniversary(todayKey, anniversaries)

  if (rows.length === 0) return null

  return (
    <div className="anniversary">
      <button
        type="button"
        className="anniversary-badge"
        aria-expanded={isOpen}
        aria-label={rows.map(row => `${row.label} ${formatDays(row.days)}`).join(', ')}
        onClick={() => setIsOpen(!isOpen)}
      >
        {rows.map(row => (
          <span key={row.key} className={row.className}>
            {row.icon(11)}
            {formatDays(row.days)}
          </span>
        ))}
      </button>
      {isOpen && (
        <>
          <button type="button" className="anniversary-backdrop" aria-label="닫기" onClick={() => setIsOpen(false)} />
          <div className="anniversary-detail" role="dialog" aria-label="기념일">
            {rows.map(row => (
              <p key={row.key} className={row.className}>
                {row.icon(14)}
                {row.label} {formatDays(row.days)}
                <small>{formatDate(row.startKey)}</small>
              </p>
            ))}
            {next && (
              <p className="anniversary-next">
                다음 기념일 · {next.label} · {daysLeftText(next.daysLeft)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default AnniversaryBadge
