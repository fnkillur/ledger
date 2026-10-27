import { useState } from 'react'
import { createPortal } from 'react-dom'
import { deleteEvent, saveEvent, toCalendarError } from '../../db/calendar'
import { usePersonName } from '../../db/hooks'
import {
  CALENDAR_TARGETS,
  isDayInfo,
  REPEAT_LABEL,
  TARGET_TONE,
  targetLabel,
  type CalendarEvent,
  type CalendarTarget,
  type Repeat,
  type RepeatScope,
} from '../../domain/calendar'
import { canSaveForm, changeTarget, formFromEvent, moveStart, newForm, toEventInput, type CalendarForm } from '../../domain/calendarForm'
import { getSettings } from '../../sync/settings'
import ConfirmSheet from '../ConfirmSheet'
import Segmented from '../Segmented'
import TopBar from '../TopBar'
import { DayInfoIcon, TargetAvatars } from './CalendarEventChip'
import { DateTimeRow } from './DateTimePicker'
import RepeatScopeSheet from './RepeatScopeSheet'

const REPEAT_OPTIONS = ['daily', 'weekly', 'monthly', 'yearly'] as const satisfies Repeat[]
const PEOPLE_TARGETS = CALENDAR_TARGETS.filter(target => !isDayInfo(target))
const DAY_INFO_TARGETS = CALENDAR_TARGETS.filter(isDayInfo)

type CalendarEventFormProps = {
  event?: CalendarEvent
  date: string
  // page는 화면 전체, sheet는 날짜 시트 안에 들어간다.
  layout: 'page' | 'sheet'
  onDone: () => void
  onCancel: () => void
}

function CalendarEventForm({ event, date, layout, onDone, onCancel }: CalendarEventFormProps) {
  const [form, setForm] = useState<CalendarForm>(() => (event ? formFromEvent(event) : newForm(date, getSettings().defaultPerson, new Date())))
  const [sheet, setSheet] = useState<'saveScope' | 'deleteScope' | 'delete' | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const [lastRepeat, setLastRepeat] = useState<Repeat>(form.repeat === 'none' ? 'weekly' : form.repeat)

  const title = event ? '일정 수정' : '새 일정'
  const isRepeatOn = form.repeat !== 'none'
  const isRepeating = !!event?.seriesId
  // 한 회차만 고치는 건 반복 규칙을 바꿀 수 없어서, 반복을 바꿨으면 그 선택지를 뺀다.
  const isRepeatChanged = !!event && form.repeat !== event.repeat
  const isTimeInvalid = !canSaveForm({ ...form, title: form.title || '제목' })
  const canSave = canSaveForm(form) && !isSaving
  const ref = event && { id: event.id, seriesId: event.seriesId, originalStart: event.originalStart, start: event.start }

  const update = (patch: Partial<CalendarForm>) => setForm(previous => ({ ...previous, ...patch }))

  const togglePicker = (picker: string) => setOpened(previous => (previous === picker ? null : picker))

  // 껐다 다시 켜면 직전에 고른 주기로 돌아간다.
  const toggleRepeat = () => {
    if (isRepeatOn) {
      setLastRepeat(form.repeat)
      update({ repeat: 'none' })
      return
    }
    update({ repeat: lastRepeat })
  }

  // 앱 저장소에 바로 반영하고 서버 전송은 뒤에서 하므로, 기다리지 않고 바로 돌아간다.
  const run = async (write: () => Promise<unknown>, failure: string) => {
    setSheet(null)
    setIsSaving(true)
    setError(null)
    try {
      await write()
      onDone()
    } catch (caught) {
      setError(`${failure} ${toCalendarError(caught)}`)
      setIsSaving(false)
    }
  }

  const save = (scope?: RepeatScope) => run(() => saveEvent({ ...toEventInput(form), ref }, scope), '저장하지 못했어요.')

  const remove = (scope: RepeatScope) => run(() => deleteEvent(ref!, scope), '지우지 못했어요.')

  const handleSave = () => {
    if (isRepeating) {
      setSheet('saveScope')
      return
    }
    save()
  }

  const saveButton = (
    <button type="button" className="text-button text-primary event-form-save" disabled={!canSave} onClick={handleSave}>
      {isSaving ? '저장 중' : '저장'}
    </button>
  )

  return (
    <div className={`event-form event-form-${layout}`}>
      {layout === 'page' ? (
        <TopBar showBack onBack={onCancel} title={title} actions={saveButton} />
      ) : (
        <div className="event-form-header">
          <button type="button" className="text-button" onClick={onCancel}>
            취소
          </button>
          <strong>{title}</strong>
          {saveButton}
        </div>
      )}

      <div className="event-form-body">
        <input
          className="event-form-title"
          placeholder="일정 이름"
          aria-label="일정 이름"
          enterKeyHint="done"
          value={form.title}
          onChange={changeEvent => update({ title: changeEvent.target.value })}
          autoFocus={!event && layout === 'page'}
        />

        <TargetPicker value={form.target} onChange={target => setForm(changeTarget(form, target))} />

        <section className="form-group" aria-label="시간">
          <div className="form-row">
            <span>하루 종일</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.allDay}
              aria-label="하루 종일"
              className="switch"
              onClick={() => update({ allDay: !form.allDay })}
            />
          </div>
          <DateTimeRow
            label="시작"
            pickerId="start"
            date={form.startDate}
            time={form.startTime}
            showTime={!form.allDay}
            opened={opened}
            onToggle={togglePicker}
            onDate={startDate => setForm(moveStart(form, { startDate }))}
            onTime={startTime => setForm(moveStart(form, { startTime }))}
          />
          <DateTimeRow
            label="종료"
            pickerId="end"
            date={form.endDate}
            time={form.endTime}
            minDate={form.startDate}
            showTime={!form.allDay}
            isInvalid={isTimeInvalid}
            opened={opened}
            onToggle={togglePicker}
            onDate={endDate => update({ endDate })}
            onTime={endTime => update({ endTime })}
          />
        </section>
        {isTimeInvalid && <p className="form-hint is-error">종료가 시작보다 빨라요.</p>}

        <section className="form-group" aria-label="반복">
          <div className="form-row">
            <span>반복</span>
            <button type="button" role="switch" aria-checked={isRepeatOn} aria-label="반복" className="switch" onClick={toggleRepeat} />
          </div>
          {isRepeatOn && (
            <div className="form-row form-row-picker">
              <Segmented
                label="반복 주기"
                options={REPEAT_OPTIONS.map(repeat => REPEAT_LABEL[repeat])}
                value={REPEAT_LABEL[form.repeat]}
                onChange={label => update({ repeat: REPEAT_OPTIONS.find(repeat => REPEAT_LABEL[repeat] === label) ?? 'weekly' })}
              />
            </div>
          )}
        </section>

        {error && <p className="status status-error">{error}</p>}

        {event && (
          <section className="form-group">
            <button type="button" className="form-row form-row-danger" disabled={isSaving} onClick={() => setSheet(isRepeating ? 'deleteScope' : 'delete')}>
              일정 삭제
            </button>
          </section>
        )}
      </div>

      {sheet &&
        createPortal(
          <>
            {sheet === 'saveScope' && <RepeatScopeSheet action="수정" allowOne={!isRepeatChanged} onSelect={save} onClose={() => setSheet(null)} />}
            {sheet === 'deleteScope' && <RepeatScopeSheet action="삭제" onSelect={remove} onClose={() => setSheet(null)} />}
            {sheet === 'delete' && (
              <ConfirmSheet message="이 일정을 지울까요?" confirmLabel="삭제" onConfirm={() => remove('all')} onCancel={() => setSheet(null)} />
            )}
          </>,
          document.body,
        )}
    </div>
  )
}

// 사람 일정과 날짜 표시(기념일·지정일)를 줄로 나눠, 단계를 늘리지 않고도 성격이 다른 걸 알아보게 한다.
function TargetPicker({ value, onChange }: { value: CalendarTarget; onChange: (target: CalendarTarget) => void }) {
  return (
    <div className="target-picker" role="radiogroup" aria-label="누구 일정">
      <div className="target-chips">
        {PEOPLE_TARGETS.map(target => (
          <TargetChip key={target} target={target} isSelected={target === value} onSelect={onChange} />
        ))}
      </div>
      <div className="target-chips">
        {DAY_INFO_TARGETS.map(target => (
          <TargetChip key={target} target={target} isSelected={target === value} onSelect={onChange} />
        ))}
      </div>
    </div>
  )
}

function TargetChip({ target, isSelected, onSelect }: { target: CalendarTarget; isSelected: boolean; onSelect: (target: CalendarTarget) => void }) {
  const personName = usePersonName()

  return (
    <button type="button" role="radio" aria-checked={isSelected} className={`target-chip ${TARGET_TONE[target]}`} onClick={() => onSelect(target)}>
      {isDayInfo(target) ? <DayInfoIcon target={target} size={18} /> : <TargetAvatars target={target} size={18} />}
      {targetLabel(target, personName)}
    </button>
  )
}

export default CalendarEventForm
