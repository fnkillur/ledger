import { PlusIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import CalendarModeSwitch from '../components/calendar/CalendarModeSwitch'
import EmptyState from '../components/EmptyState'
import PersonAvatar from '../components/PersonAvatar'
import { saveCycle } from '../db/cycles'
import { useCycleRows, usePersonName } from '../db/hooks'
import { TARGET_TONE } from '../domain/calendar'
import { daysBetween, splitCycles, type CycleInput, type CycleItem, type CycleState, type CycleTarget } from '../domain/cycle'
import { elapsedLabel, formatPeriod, periodicLabel } from '../domain/cycleText'
import { PEOPLE } from '../domain/types'
import { toDateKey } from '../utils/format'

type TargetFilter = '전체' | CycleTarget

const FILTERS: TargetFilter[] = ['전체', '공동', ...PEOPLE]

const PRESETS: CycleInput[] = [
  { name: '수건 교체', icon: '🧺', target: '공동', keyword: '수건', period: { amount: 1, unit: 'year' }, memo: '' },
  { name: '정수기 필터 교체', icon: '💧', target: '공동', keyword: '정수기', period: { amount: 6, unit: 'month' }, memo: '' },
  { name: '칫솔 교체', icon: '🪥', target: '공동', keyword: '칫솔', period: { amount: 3, unit: 'month' }, memo: '' },
  { name: '치과', icon: '🦷', target: '공동', keyword: '치과', period: null, memo: '' },
]

const todayKey = () => toDateKey(new Date().toISOString())

const formatShortDate = (dateKey: string) => {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}

const progressOf = (state: CycleState, today: string) => {
  if (!state.lastDate || !state.nextDate) return null
  const total = daysBetween(state.lastDate, state.nextDate)
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, daysBetween(state.lastDate, today) / total))
}

const searchWordOf = (item: CycleItem) => item.keyword.trim() || item.name

// 주기 없는 항목이 예약 덕분에 다가오는 쪽에 오면, 주기 대신 마지막 날을 보여 준다.
const cycleBasis = (item: CycleItem, state: CycleState) => {
  if (item.period) return formatPeriod(item.period)
  if (state.lastDate) return `${formatShortDate(state.lastDate)} 마지막`
  return '첫 예약'
}

// 캘린더 일정으로 센 교체 주기와 마지막으로 한 지를 한눈에 본다. 기록은 캘린더에 일정을 넣어서 한다.
function CyclesPage() {
  const [searchParams] = useSearchParams()
  const linkedId = searchParams.get('id')
  const navigate = useNavigate()

  const today = todayKey()
  const rows = useCycleRows(today)

  const [filter, setFilter] = useState<TargetFilter>('전체')

  const { periodic, elapsed } = splitCycles(
    (rows ?? []).filter(row => filter === '전체' || row.item.target === filter),
    today,
  )

  const open = (item: CycleItem) => navigate(`/cycles/${item.id}`)

  return (
    <div className="page cycles-page">
      <header className="period-header">
        <div className="period-header-row">
          <h1 className="cycles-title">챙길 것</h1>
        </div>
        <CalendarModeSwitch mode="주기" />
      </header>

      <main className="page-content cycles-content">
        {rows && rows.length === 0 && <CyclePresets onPick={preset => saveCycle(preset)} />}

        {rows && rows.length > 0 && <TargetFilterChips value={filter} onChange={setFilter} />}

        {periodic.length > 0 && (
          <section className="tx-section" aria-label="다가오는 일정">
            <h2 className="tx-section-title">다가오는 일정</h2>
            <ul className="cycle-list">
              {periodic.map(row => (
                <PeriodicCard key={row.item.id} item={row.item} state={row.state} today={today} isLinked={row.item.id === linkedId} onOpen={() => open(row.item)} />
              ))}
            </ul>
          </section>
        )}

        {elapsed.length > 0 && (
          <section className="tx-section" aria-label="마지막으로 한 지">
            <h2 className="tx-section-title">마지막으로 한 지</h2>
            <ul className="cycle-grid">
              {elapsed.map(row => (
                <ElapsedCard key={row.item.id} item={row.item} state={row.state} today={today} isLinked={row.item.id === linkedId} onOpen={() => open(row.item)} />
              ))}
            </ul>
          </section>
        )}
      </main>

      <Link to="/cycles/new" className="fab" aria-label="주기 항목 추가">
        <PlusIcon size={26} weight="bold" aria-hidden="true" />
      </Link>
    </div>
  )
}

function TargetFilterChips({ value, onChange }: { value: TargetFilter; onChange: (filter: TargetFilter) => void }) {
  const personName = usePersonName()

  return (
    <div className="scope-chips" role="radiogroup" aria-label="대상">
      {FILTERS.map(filter => (
        <button key={filter} type="button" role="radio" aria-checked={filter === value} className="chip scope-chip" onClick={() => onChange(filter)}>
          {filter !== '전체' && <PersonAvatar person={filter} size={16} />}
          {filter === '전체' || filter === '공동' ? filter : personName(filter)}
        </button>
      ))}
    </div>
  )
}

type CycleCardProps = {
  item: CycleItem
  state: CycleState
  today: string
  isLinked: boolean
  onOpen: () => void
}

// 알림을 누르고 들어오면 그 항목으로 내려가 잠깐 강조한다.
function useLinkedScroll(isLinked: boolean) {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (isLinked) ref.current?.scrollIntoView({ block: 'center' })
  }, [isLinked])

  return ref
}

function PeriodicCard({ item, state, today, isLinked, onOpen }: CycleCardProps) {
  const ref = useLinkedScroll(isLinked)

  const label = periodicLabel(state, today)
  const progress = progressOf(state, today)

  return (
    <li ref={ref} className={`cycle-row ${TARGET_TONE[item.target]}${isLinked ? ' is-linked' : ''}`}>
      <button type="button" className="cycle-row-main" onClick={onOpen}>
        <CycleWho item={item} />
        <span className="cycle-text">
          <span className="cycle-title">
            <span aria-hidden="true">{item.icon || '🔁'}</span>
            <strong>{item.name}</strong>
          </span>
          {progress !== null && (
            <span className={`cycle-progress tone-${label.tone}`} aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          )}
          <small>
            {cycleBasis(item, state)}
            {state.nextDate ? ` · ${state.isReservedNext ? '예약' : '다음'} ${formatShortDate(state.nextDate)}` : ` · '${searchWordOf(item)}' 일정 없음`}
          </small>
        </span>
        <span className={`cycle-badge tone-${label.tone}`}>{label.text}</span>
      </button>
    </li>
  )
}

function ElapsedCard({ item, state, today, isLinked, onOpen }: CycleCardProps) {
  const ref = useLinkedScroll(isLinked)

  const personName = usePersonName()

  return (
    <li ref={ref} className={`cycle-tile ${TARGET_TONE[item.target]}${isLinked ? ' is-linked' : ''}`}>
      <button type="button" className="cycle-tile-main" onClick={onOpen}>
        <span className="cycle-tile-target">
          <PersonAvatar person={item.target} size={22} />
          {item.target === '공동' ? '공동' : personName(item.target)}
        </span>
        <span className="cycle-tile-head">
          <span className="cycle-tile-icon" aria-hidden="true">
            {item.icon || '🔁'}
          </span>
          <strong>{item.name}</strong>
        </span>
        <span className={`cycle-tile-elapsed${state.lastDate ? '' : ' is-empty'}`}>{elapsedLabel(state, today)}</span>
        <small>{state.lastDate ? `${formatShortDate(state.lastDate)} 마지막` : `'${searchWordOf(item)}' 일정 없음`}</small>
        {state.reservation && <small className="cycle-tile-reservation">예약 {formatShortDate(state.reservation)}</small>}
      </button>
    </li>
  )
}

function CycleWho({ item }: { item: CycleItem }) {
  const personName = usePersonName()

  return (
    <span className="cycle-who">
      <span className="cycle-who-avatar" aria-hidden="true">
        <PersonAvatar person={item.target} size={30} />
      </span>
      <span className="cycle-who-name">{item.target === '공동' ? '공동' : personName(item.target)}</span>
    </span>
  )
}

function CyclePresets({ onPick }: { onPick: (preset: CycleInput) => void }) {
  return (
    <>
      <EmptyState sticker="peek">
        바꿀 때가 된 것, 다녀온 지 얼마나 됐는지
        <br />
        여기서 챙겨 볼까요?
      </EmptyState>
      <div className="cycle-presets">
        {PRESETS.map(preset => (
          <button key={preset.name} type="button" className="chip" onClick={() => onPick(preset)}>
            {preset.icon} {preset.name} · {formatPeriod(preset.period)}
          </button>
        ))}
      </div>
    </>
  )
}

export default CyclesPage
