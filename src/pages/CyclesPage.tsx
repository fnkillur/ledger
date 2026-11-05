import { PlusIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import CalendarModeSwitch from '../components/calendar/CalendarModeSwitch'
import EmptyState from '../components/EmptyState'
import PersonAvatar from '../components/PersonAvatar'
import { saveCycle } from '../db/cycles'
import { useCycleRows, usePersonName } from '../db/hooks'
import { TARGET_TONE } from '../domain/calendar'
import { daysBetween, splitCycles, visibleCycles, type CycleInput, type CycleItem, type CycleState } from '../domain/cycle'
import { elapsedLabel, formatPeriod, periodicLabel } from '../domain/cycleText'
import { DEVICE_PERSON } from '../platform'
import { toDateKey } from '../utils/format'

const SHOWS_OTHERS_KEY = 'cycles.showsOthers'

const loadShowsOthers = () => {
  try {
    return localStorage.getItem(SHOWS_OTHERS_KEY) === 'true'
  } catch {
    return false
  }
}

const saveShowsOthers = (value: boolean) => {
  try {
    localStorage.setItem(SHOWS_OTHERS_KEY, String(value))
  } catch {
    // 저장하지 못해도 이번에 보는 동안은 켜 둔 대로 보인다.
  }
}

const PRESETS: CycleInput[] = [
  { name: '수건 교체', icon: '🧺', target: '공동', keyword: '수건', anchor: null, period: { amount: 1, unit: 'year' }, memo: '' },
  { name: '정수기 필터 교체', icon: '💧', target: '공동', keyword: '정수기', anchor: null, period: { amount: 6, unit: 'month' }, memo: '' },
  { name: '칫솔 교체', icon: '🪥', target: '공동', keyword: '칫솔', anchor: null, period: { amount: 3, unit: 'month' }, memo: '' },
  { name: '치과', icon: '🦷', target: '공동', keyword: '치과', anchor: null, period: null, memo: '' },
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

// 캘린더 일정으로 센 교체 주기와 마지막으로 한 지를 한눈에 본다. 기록은 캘린더에 일정을 넣어서 한다.
function CyclesPage() {
  const [searchParams] = useSearchParams()
  const linkedId = searchParams.get('id')
  const navigate = useNavigate()

  const today = todayKey()
  const rows = useCycleRows(today)

  const [showsOthers, setShowsOthers] = useState(loadShowsOthers)

  // 교체 주기는 집안일이라 모두 보이고, 마지막으로 한 지는 기본으로 내 것(과 공동)만 보인다.
  const { periodic, elapsed: allElapsed } = splitCycles(rows ?? [])
  const elapsed = visibleCycles(allElapsed, DEVICE_PERSON, showsOthers)

  const open = (item: CycleItem) => navigate(`/cycles/${item.id}`)

  const toggleShowsOthers = () => {
    saveShowsOthers(!showsOthers)
    setShowsOthers(!showsOthers)
  }

  // 정해진 주기는 고르는 날부터 회차를 센다.
  const addPreset = (preset: CycleInput) => saveCycle({ ...preset, anchor: preset.period ? today : null })

  return (
    <div className="page cycles-page">
      <header className="period-header">
        <div className="period-header-row">
          <h1 className="cycles-title">챙길 것</h1>
        </div>
        <CalendarModeSwitch mode="주기" />
      </header>

      <main className="page-content cycles-content">
        {rows && rows.length === 0 && <CyclePresets onPick={addPreset} />}

        {periodic.length > 0 && (
          <section className="tx-section" aria-label="다가오는 교체 주기">
            <h2 className="tx-section-title">다가오는 교체 주기</h2>
            <ul className="cycle-list">
              {periodic.map(row => (
                <PeriodicCard key={row.item.id} item={row.item} state={row.state} today={today} isLinked={row.item.id === linkedId} onOpen={() => open(row.item)} />
              ))}
            </ul>
          </section>
        )}

        {allElapsed.length > 0 && (
          <section className="tx-section" aria-label="마지막으로 한 지">
            <div className="tx-section-header">
              <h2 className="tx-section-title">마지막으로 한 지</h2>
              <ShowsOthersSwitch checked={showsOthers} onToggle={toggleShowsOthers} />
            </div>
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

function ShowsOthersSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const personName = usePersonName()

  const other = DEVICE_PERSON === '쿠리만쥬' ? '우사기' : '쿠리만쥬'

  return (
    <button type="button" role="switch" aria-checked={checked} className="shows-others" onClick={onToggle}>
      {personName(other)} 것도 보기
      <span className="shows-others-switch" aria-hidden="true" />
    </button>
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
    <li ref={ref} className={`cycle-row${isLinked ? ' is-linked' : ''}`}>
      <button type="button" className="cycle-row-main" onClick={onOpen}>
        <span className="cycle-text">
          <span className="cycle-title">
            <span aria-hidden="true">{item.icon || '🔁'}</span>
            <strong>{item.name}</strong>
            {item.target !== '공동' && <PersonAvatar person={item.target} size={18} />}
          </span>
          {progress !== null && (
            <span className={`cycle-progress tone-${label.tone}`} aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          )}
          <small>
            {formatPeriod(item.period)}
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
