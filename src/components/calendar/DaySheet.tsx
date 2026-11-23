import { HeartIcon, PlusIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import kurimanjuThinking from '../../assets/stickers/kurimanju/thinking.webp'
import usagiSigh from '../../assets/stickers/usagi/sigh.webp'
import { Link } from 'react-router'
import { usePersonName } from '../../db/hooks'
import type { CycleItem } from '../../domain/cycle'
import { isDayInfo, REPEAT_LABEL, TARGET_TONE, targetLabel, type CalendarEvent } from '../../domain/calendar'
import { IS_WEB_BUILD } from '../../platform'
import { formatDayTitle, formatTime, toDateKey } from '../../utils/format'
import CalendarEventForm from './CalendarEventForm'
import { DayInfoIcon, TargetAvatars } from './CalendarEventChip'
import { useBackHandler } from '../../navigation/back'
import useSheetDrag from '../useSheetDrag'

// 웹(아이폰)은 우사기, 안드로이드 앱은 쿠리만쥬가 일정 추가 버튼을 지킨다.
const ADD_STICKER = IS_WEB_BUILD ? usagiSigh : kurimanjuThinking

export type DaySheetView = { type: 'list' } | { type: 'form'; event?: CalendarEvent }

type DaySheetProps = {
  dateKey: string
  events: CalendarEvent[]
  cycles?: CycleItem[]
  holiday?: string
  anniversaries?: string[]
  initialView?: DaySheetView
  onClose: () => void
}

const formatShortDate = (dateKey: string) => `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`

// 카드 왼쪽 시간 칸: 위에는 시작, 아래에는 끝. 다른 날에 걸치면 날짜를 붙인다.
const timeColumn = (event: CalendarEvent, dateKey: string) => {
  if (event.allDay) {
    if (event.start === event.end) return { top: '종일', bottom: '' }
    return { top: formatShortDate(event.start), bottom: `~${formatShortDate(event.end)}` }
  }
  const startDay = toDateKey(event.start)
  const endDay = toDateKey(event.end)
  return {
    top: startDay === dateKey ? formatTime(event.start) : formatShortDate(startDay),
    bottom: endDay === dateKey ? formatTime(event.end) : `~${formatShortDate(endDay)}`,
  }
}

function DaySheet({ dateKey, events, cycles = [], holiday, anniversaries = [], initialView = { type: 'list' }, onClose }: DaySheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { close, isClosing, handleProps } = useSheetDrag({ sheetRef, scrollRef, onClose })

  const [view, setView] = useState<DaySheetView>(initialView)

  const showList = () => {
    setView({ type: 'list' })
    scrollRef.current?.scrollTo({ top: 0 })
  }

  // 일정 폼을 보고 있으면 목록으로, 목록이면 시트를 닫는다.
  useBackHandler(() => (view.type === 'form' ? showList() : close()))

  return (
    <div className={`sheet-backdrop day-sheet-backdrop${isClosing ? ' is-closing' : ''}`} onClick={close}>
      <div ref={sheetRef} className="day-sheet" role="dialog" aria-label={formatDayTitle(dateKey)} onClick={event => event.stopPropagation()}>
        <div className="day-sheet-handle" {...handleProps}>
          <span className="day-sheet-grabber" aria-hidden="true" />
          {view.type === 'list' && <h2>{formatDayTitle(dateKey)}</h2>}
        </div>

        {view.type === 'list' ? (
          <div key="list" className="day-sheet-view">
            <div ref={scrollRef} className="day-sheet-scroll">
              {holiday && <p className="day-sheet-holiday">{holiday}</p>}
              {!holiday && events.length === 0 && cycles.length === 0 && anniversaries.length === 0 && <p className="day-sheet-empty">이 날은 아직 일정이 없어요.</p>}
              {anniversaries.length > 0 && (
                <ul className="day-sheet-list day-sheet-anniversaries" aria-label="기념일">
                  {anniversaries.map(label => (
                    <li key={label}>
                      <HeartIcon size={14} weight="fill" aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>
              )}
              {cycles.length > 0 && (
                <ul className="day-sheet-list day-sheet-cycles" aria-label="교체할 것">
                  {cycles.map(item => (
                    <li key={item.id}>
                      <Link to={`/cycles?id=${item.id}`} className="day-sheet-cycle">
                        <span aria-hidden="true">{item.icon || '🔁'}</span>
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="day-sheet-list">
                {events.map(event => (
                  <li key={event.id}>
                    <button type="button" className={`day-sheet-item ${TARGET_TONE[event.target]}`} onClick={() => setView({ type: 'form', event })}>
                      <EventCard event={event} dateKey={dateKey} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="day-sheet-footer">
              <button type="button" className="add-sticker" onClick={() => setView({ type: 'form' })} aria-label="일정 추가">
                <img src={ADD_STICKER} alt="" className="add-sticker-image" draggable={false} />
                <span className="add-sticker-plus" aria-hidden="true">
                  <PlusIcon size={16} weight="bold" />
                </span>
                <span className="add-sticker-label">일정 추가</span>
              </button>
            </div>
          </div>
        ) : (
          <div key={view.event?.id ?? 'new'} ref={scrollRef} className="day-sheet-view day-sheet-scroll is-form">
            <CalendarEventForm event={view.event} date={dateKey} layout="sheet" onDone={showList} onCancel={showList} />
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, dateKey }: { event: CalendarEvent; dateKey: string }) {
  const personName = usePersonName()

  const time = timeColumn(event, dateKey)

  return (
    <>
      <span className="day-sheet-time">
        <strong>{time.top}</strong>
        {time.bottom && <span>{time.bottom}</span>}
      </span>
      <span className="day-sheet-accent" aria-hidden="true" />
      <span className="day-sheet-main">
        <strong>{event.title}</strong>
        <span className="day-sheet-meta">
          {isDayInfo(event.target) ? <DayInfoIcon target={event.target} size={16} /> : <TargetAvatars target={event.target} size={16} />}
          {targetLabel(event.target, personName)}
          {event.repeat !== 'none' && ` · ${REPEAT_LABEL[event.repeat]}`}
        </span>
      </span>
    </>
  )
}

export default DaySheet
