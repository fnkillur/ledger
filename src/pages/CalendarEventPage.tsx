import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import RepeatScopeSheet from '../components/calendar/RepeatScopeSheet'
import { TargetAvatars } from '../components/calendar/CalendarEventChip'
import ConfirmSheet from '../components/ConfirmSheet'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import { saveAndRefresh, toCalendarError } from '../db/calendar'
import { db } from '../db/database'
import { usePersonName } from '../db/hooks'
import { CALENDAR_TARGETS, REPEAT_LABEL, REPEATS, type CalendarEvent, type CalendarTarget, type Repeat, type RepeatScope } from '../domain/calendar'
import { canSaveForm, formFromEvent, moveStart, newForm, toEventInput, type CalendarForm } from '../domain/calendarForm'
import { deleteCalendarEvent, saveCalendarEvent } from '../sync/calendarApi'
import { getSettings, type Settings } from '../sync/settings'
import { toDateKey } from '../utils/format'
import { useCalendarMonthKey } from '../utils/viewState'
import NotFoundPage from './NotFoundPage'

const REPEAT_LABELS = REPEATS.map(repeat => REPEAT_LABEL[repeat])

const todayKey = () => toDateKey(new Date().toISOString())

function CalendarEventPage() {
  const { id } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const passed = (location.state as { event?: CalendarEvent } | null)?.event
  const cached = useLiveQuery(async () => {
    if (!id || passed) return null
    const months = await db.calendarMonths.toArray()
    return months.flatMap(month => month.events).find(event => event.id === id) ?? null
  }, [id, passed])

  if (!id) return <CalendarEventForm date={searchParams.get('date')} />
  if (passed) return <CalendarEventForm event={passed} />
  if (cached === undefined) return null
  if (cached === null) return <NotFoundPage />
  return <CalendarEventForm event={cached} />
}

type CalendarEventFormProps = { event?: CalendarEvent; date?: string | null }

function CalendarEventForm({ event, date }: CalendarEventFormProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const monthKey = useCalendarMonthKey()

  const [form, setForm] = useState<CalendarForm>(() =>
    event ? formFromEvent(event) : newForm(date ?? todayKey(), getSettings().defaultPerson, new Date()),
  )
  const [sheet, setSheet] = useState<'saveScope' | 'deleteScope' | 'delete' | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRepeating = !!event?.seriesId
  // 한 회차만 고치는 건 반복 규칙을 바꿀 수 없어서, 반복을 바꿨으면 그 선택지를 뺀다.
  const isRepeatChanged = !!event && form.repeat !== event.repeat
  const canSave = canSaveForm(form) && !isSaving

  // 링크로 이 화면부터 열렸으면 돌아갈 화면이 없으므로 캘린더로 간다.
  const goBack = () => (location.key === 'default' ? navigate('/', { replace: true }) : navigate(-1))

  const update = (patch: Partial<CalendarForm>) => setForm(previous => ({ ...previous, ...patch }))

  const run = async (write: (settings: Settings) => Promise<unknown>, failure: string) => {
    setSheet(null)
    setIsSaving(true)
    setError(null)
    try {
      await saveAndRefresh(monthKey, write)
      goBack()
    } catch (caught) {
      setError(`${failure} ${toCalendarError(caught)}`)
      setIsSaving(false)
    }
  }

  const ref = event && { id: event.id, seriesId: event.seriesId, originalStart: event.originalStart, start: event.start }

  const save = (scope?: RepeatScope) =>
    run(settings => saveCalendarEvent(settings, { ...toEventInput(form), ref }, scope), '저장하지 못했어요.')

  const remove = (scope: RepeatScope) => run(settings => deleteCalendarEvent(settings, ref!, scope), '지우지 못했어요.')

  const handleSave = () => {
    if (isRepeating) {
      setSheet('saveScope')
      return
    }
    save()
  }

  return (
    <div className="page">
      <TopBar showBack onBack={goBack} title={event ? '일정 수정' : '일정 추가'} />

      <main className="page-content form">
        <section className="card form-section">
          <label className="field">
            <span className="field-label">제목</span>
            <input
              className="field-input"
              placeholder="예: 대형마트 휴무"
              value={form.title}
              onChange={changeEvent => update({ title: changeEvent.target.value })}
              autoFocus={!event}
            />
          </label>

          <div className="field">
            <span className="field-label">누구 일정</span>
            <TargetPicker value={form.target} onChange={target => update({ target })} />
          </div>
        </section>

        <section className="card form-section">
          <div className="setting-row">
            <span className="field-label">하루 종일</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.allDay}
              aria-label="하루 종일"
              className="switch"
              onClick={() => update({ allDay: !form.allDay })}
            />
          </div>

          <div className="field">
            <span className="field-label">시작</span>
            <div className="date-time-row">
              <input
                className="field-input"
                type="date"
                aria-label="시작 날짜"
                value={form.startDate}
                onChange={changeEvent => changeEvent.target.value && setForm(moveStart(form, { startDate: changeEvent.target.value }))}
              />
              {!form.allDay && (
                <input
                  className="field-input"
                  type="time"
                  aria-label="시작 시간"
                  value={form.startTime}
                  onChange={changeEvent => changeEvent.target.value && setForm(moveStart(form, { startTime: changeEvent.target.value }))}
                />
              )}
            </div>
          </div>

          <div className="field">
            <span className="field-label">끝</span>
            <div className="date-time-row">
              <input
                className="field-input"
                type="date"
                aria-label="끝 날짜"
                min={form.startDate}
                value={form.endDate}
                onChange={changeEvent => changeEvent.target.value && update({ endDate: changeEvent.target.value })}
              />
              {!form.allDay && (
                <input
                  className="field-input"
                  type="time"
                  aria-label="끝 시간"
                  value={form.endTime}
                  onChange={changeEvent => changeEvent.target.value && update({ endTime: changeEvent.target.value })}
                />
              )}
            </div>
            {!canSaveForm({ ...form, title: form.title || '제목' }) && <span className="field-error">끝이 시작보다 빨라요.</span>}
          </div>

          <div className="field">
            <span className="field-label">반복</span>
            <Segmented
              label="반복"
              options={REPEAT_LABELS}
              value={REPEAT_LABEL[form.repeat]}
              onChange={label => update({ repeat: REPEATS[REPEAT_LABELS.indexOf(label)] as Repeat })}
            />
          </div>
        </section>

        {error && <p className="status status-error">{error}</p>}

        {event && (
          <div className="form-actions">
            <button
              type="button"
              className="button button-danger-outline"
              disabled={isSaving}
              onClick={() => setSheet(isRepeating ? 'deleteScope' : 'delete')}
            >
              삭제
            </button>
          </div>
        )}
      </main>

      <div className="save-bar">
        <div className="save-bar-totals" />
        <button type="button" className="button button-primary" disabled={!canSave} onClick={handleSave}>
          {isSaving ? '저장 중…' : '저장'}
        </button>
      </div>

      {sheet === 'saveScope' && <RepeatScopeSheet action="수정" allowOne={!isRepeatChanged} onSelect={save} onClose={() => setSheet(null)} />}
      {sheet === 'deleteScope' && <RepeatScopeSheet action="삭제" onSelect={remove} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && (
        <ConfirmSheet message="이 일정을 지울까요?" confirmLabel="삭제" onConfirm={() => remove('all')} onCancel={() => setSheet(null)} />
      )}
    </div>
  )
}

function TargetPicker({ value, onChange }: { value: CalendarTarget; onChange: (target: CalendarTarget) => void }) {
  const personName = usePersonName()

  const labelOf = (target: CalendarTarget) => (target === '공동' || target === '없음' ? target : personName(target))

  return (
    <div className="person-toggle target-picker" role="radiogroup" aria-label="누구 일정">
      {CALENDAR_TARGETS.map(target => (
        <button
          key={target}
          type="button"
          role="radio"
          aria-checked={target === value}
          className="person-toggle-option"
          onClick={() => onChange(target)}
        >
          <TargetAvatars target={target} size={18} />
          {labelOf(target)}
        </button>
      ))}
    </div>
  )
}

export default CalendarEventPage
