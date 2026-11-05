import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { DateTimeRow } from '../components/calendar/DateTimePicker'
import ConfirmSheet from '../components/ConfirmSheet'
import FieldHint from '../components/FieldHint'
import PersonAvatar from '../components/PersonAvatar'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import NotFoundPage from './NotFoundPage'
import { deleteCycle, saveCycle } from '../db/cycles'
import { useCycle, usePersonName } from '../db/hooks'
import { type CycleInput, type CycleItem, type CycleTarget, type CycleUnit } from '../domain/cycle'
import { cycleFormError } from '../domain/cycleForm'
import { UNIT_LABEL } from '../domain/cycleText'
import { PEOPLE } from '../domain/types'
import { toDateKey } from '../utils/format'
import { scrollToTopOnReturn } from '../utils/scroll'

const TARGETS: CycleTarget[] = ['공동', ...PEOPLE]
const UNITS: CycleUnit[] = ['day', 'week', 'month', 'year']
const UNIT_OPTIONS = UNITS.map(unit => UNIT_LABEL[unit])

const todayKey = () => toDateKey(new Date().toISOString())

const emptyDraft = (): CycleInput => ({
  name: '',
  icon: '',
  target: '공동',
  keyword: '',
  anchor: todayKey(),
  period: { amount: 6, unit: 'month' },
  memo: '',
})

const toInput = ({ id: _id, deleted: _deleted, updatedAt: _updatedAt, ...input }: CycleItem): CycleInput => input

function CycleEditPage() {
  const { id } = useParams()

  const cycle = useCycle(id)

  if (!id) return <CycleForm initial={emptyDraft()} />
  if (cycle === undefined) return null
  if (cycle === null) return <NotFoundPage />
  return <CycleForm key={cycle.id} initial={toInput(cycle)} item={cycle} />
}

type CycleFormProps = {
  initial: CycleInput
  item?: CycleItem
}

function CycleForm({ initial, item }: CycleFormProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const personName = usePersonName()

  const [draft, setDraft] = useState(initial)
  const [isDeleting, setIsDeleting] = useState(false)
  const [openedPicker, setOpenedPicker] = useState<string | null>(null)

  const error = cycleFormError(draft)

  const update = (patch: Partial<CycleInput>) => setDraft(previous => ({ ...previous, ...patch }))

  const goBack = () => (location.key === 'default' ? navigate('/cycles', { replace: true }) : navigate(-1))

  const togglePeriod = () => update(draft.period ? { period: null, anchor: null } : { period: { amount: 6, unit: 'month' }, anchor: todayKey() })

  const handleSave = async () => {
    if (error) return
    await saveCycle({ ...draft, name: draft.name.trim(), icon: draft.icon.trim(), keyword: draft.keyword.trim(), memo: draft.memo.trim() }, item?.id)
    if (!item) scrollToTopOnReturn()
    goBack()
  }

  const handleDelete = async () => {
    if (!item) return
    await deleteCycle(item.id)
    goBack()
  }

  return (
    <div className="page">
      <TopBar showBack onBack={goBack} title={item ? '주기 항목 수정' : '주기 항목 추가'} />

      <main className="page-content tx-form">
        <section className="form-group">
          <div className="form-row">
            <input
              className="cycle-icon-input"
              aria-label="아이콘"
              placeholder="🔁"
              maxLength={4}
              value={draft.icon}
              onChange={event => update({ icon: event.target.value })}
            />
            <input
              className="tx-merchant"
              aria-label="이름"
              placeholder="예: 정수기 필터, 치과"
              enterKeyHint="done"
              value={draft.name}
              onChange={event => update({ name: event.target.value })}
            />
          </div>
        </section>

        <section className="form-group">
          <div className="form-row">
            <span>누구 것</span>
            <AvatarSegmented
              label="대상"
              options={TARGETS.map(target => ({ value: target, label: target === '공동' ? target : personName(target), avatar: target }))}
              value={draft.target}
              onChange={target => update({ target })}
            />
          </div>
          <SwitchRow label="주기" hint={draft.period ? '기준일부터 주기마다 날짜가 고정돼요' : '다녀온 지 며칠 됐는지만 세요'} checked={draft.period !== null} onToggle={togglePeriod} />
          {draft.period && (
            <div className="form-row">
              <span>간격</span>
              <div className="cycle-period">
                <input
                  className="pill-input cycle-number"
                  aria-label="주기 숫자"
                  inputMode="numeric"
                  value={draft.period.amount || ''}
                  onChange={event => update({ period: { ...draft.period!, amount: Number(event.target.value.replace(/\D/g, '')) } })}
                />
                <div className="tx-compact">
                  <Segmented
                    label="주기 단위"
                    options={UNIT_OPTIONS}
                    value={UNIT_LABEL[draft.period.unit]}
                    onChange={label => update({ period: { ...draft.period!, unit: UNITS[UNIT_OPTIONS.indexOf(label)] } })}
                  />
                </div>
              </div>
            </div>
          )}
          {draft.period && draft.anchor !== null && (
            <DateTimeRow
              label="기준일"
              pickerId="anchor"
              date={draft.anchor}
              time="12:00"
              showTime={false}
              opened={openedPicker}
              onToggle={picker => setOpenedPicker(previous => (previous === picker ? null : picker))}
              onDate={anchor => update({ anchor })}
              onTime={() => {}}
            />
          )}
          {draft.period && draft.anchor === null && (
            <div className="form-row">
              <span className="form-row-text">
                기준일
                <small>지금은 마지막 일정부터 세요</small>
              </span>
              <button type="button" className="text-button text-primary" onClick={() => update({ anchor: todayKey() })}>
                정하기
              </button>
            </div>
          )}
        </section>

        <section className="form-group">
          <div className="form-row">
            <span className="form-row-text">
              일정 제목에 들어간 말
              <small>캘린더에서 이 말이 든 일정을 마지막으로 한 날로 봐요</small>
            </span>
            <input
              className="tx-memo"
              aria-label="일정 제목에 들어간 말"
              placeholder={draft.name.trim() || '항목 이름'}
              enterKeyHint="done"
              value={draft.keyword}
              onChange={event => update({ keyword: event.target.value })}
            />
          </div>
        </section>

        <section className="form-group">
          <div className="form-row">
            <span>메모</span>
            <input className="tx-memo" aria-label="메모" placeholder="남길 말" value={draft.memo} onChange={event => update({ memo: event.target.value })} />
          </div>
        </section>

        {item && (
          <section className="form-group">
            <button type="button" className="form-row form-row-danger" onClick={() => setIsDeleting(true)}>
              삭제
            </button>
          </section>
        )}
      </main>

      <div className="bottom-cta">
        {error && draft.name.trim() !== '' && <FieldHint tone="error">{error}</FieldHint>}
        <button type="button" className="button button-primary" disabled={error !== null} onClick={handleSave}>
          {draft.name.trim() === '' ? '이름을 입력해 주세요' : '저장'}
        </button>
      </div>

      {isDeleting && <ConfirmSheet message="이 항목과 기록을 모두 지울까요?" confirmLabel="삭제" onConfirm={handleDelete} onCancel={() => setIsDeleting(false)} />}
    </div>
  )
}

type AvatarOption<T extends string> = { value: T; label: string; avatar?: CycleTarget }

type AvatarSegmentedProps<T extends string> = { label: string; options: AvatarOption<T>[]; value: T; onChange: (value: T) => void }

function AvatarSegmented<T extends string>({ label, options, value, onChange }: AvatarSegmentedProps<T>) {
  return (
    <div className="segmented tx-compact" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`segmented-option${option.avatar ? ' with-avatar' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.avatar && <PersonAvatar person={option.avatar} size={18} />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

type SwitchRowProps = { label: string; hint: string; checked: boolean; onToggle: () => void }

function SwitchRow({ label, hint, checked, onToggle }: SwitchRowProps) {
  return (
    <div className="form-row">
      <span className="form-row-text">
        {label}
        <small>{hint}</small>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={onToggle} />
    </div>
  )
}

export default CycleEditPage
