import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { DateTimeRow } from '../components/calendar/DateTimePicker'
import ConfirmSheet from '../components/ConfirmSheet'
import FieldHint from '../components/FieldHint'
import PersonAvatar from '../components/PersonAvatar'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import NotFoundPage from './NotFoundPage'
import { deleteCycle, deleteCycleLog, logCycle, saveCycle, updateCycleLog } from '../db/cycles'
import { useCategories, useCycle, usePersonName } from '../db/hooks'
import { NOTIFY_OFFSETS, type CycleInput, type CycleItem, type CycleLog, type CycleTarget, type CycleUnit } from '../domain/cycle'
import { cycleFormError } from '../domain/cycleForm'
import { UNIT_LABEL } from '../domain/cycleText'
import { PEOPLE, UNCATEGORIZED, type Person } from '../domain/types'
import { DEVICE_PERSON } from '../platform'
import { isPushEnabled } from '../push/push'
import { toDateKey } from '../utils/format'
import { scrollToTopOnReturn } from '../utils/scroll'

const TARGETS: CycleTarget[] = ['공동', ...PEOPLE]
const UNITS: CycleUnit[] = ['day', 'week', 'month', 'year']
const UNIT_OPTIONS = UNITS.map(unit => UNIT_LABEL[unit])

const emptyDraft = (): CycleInput => ({
  name: '',
  icon: '',
  target: '공동',
  period: { amount: 6, unit: 'month' },
  link: null,
  notify: { enabled: false, offsets: [0, 3], afterDays: null },
  memo: '',
})

const toInput = ({ id: _id, deleted: _deleted, updatedAt: _updatedAt, ...input }: CycleItem): CycleInput => input

const offsetLabel = (offset: number) => (offset === 0 ? '당일' : `${offset}일 전`)

const todayKey = () => toDateKey(new Date().toISOString())

function CycleEditPage() {
  const { id } = useParams()

  const cycle = useCycle(id)

  if (!id) return <CycleForm initial={emptyDraft()} />
  if (cycle === undefined) return null
  if (cycle === null) return <NotFoundPage />
  return <CycleForm key={cycle.item.id} initial={toInput(cycle.item)} item={cycle.item} logs={cycle.logs} />
}

type CycleFormProps = {
  initial: CycleInput
  item?: CycleItem
  logs?: CycleLog[]
}

function CycleForm({ initial, item, logs = [] }: CycleFormProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const categories = useCategories()
  const personName = usePersonName()

  const [draft, setDraft] = useState(initial)
  const [lastDate, setLastDate] = useState<string | null>(item ? null : todayKey())
  const [openedPicker, setOpenedPicker] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const error = cycleFormError(draft)
  const expenseCategories = categories.filter(category => category.kind === '지출' && category.name !== UNCATEGORIZED)

  const update = (patch: Partial<CycleInput>) => setDraft(previous => ({ ...previous, ...patch }))
  const updateNotify = (patch: Partial<CycleInput['notify']>) => update({ notify: { ...draft.notify, ...patch } })

  const goBack = () => (location.key === 'default' ? navigate('/cycles', { replace: true }) : navigate(-1))

  const togglePeriod = () =>
    update({ period: draft.period ? null : { amount: 6, unit: 'month' }, notify: { ...draft.notify, afterDays: draft.period ? (draft.notify.afterDays ?? 90) : null } })

  const toggleOffset = (offset: number) => {
    const offsets = draft.notify.offsets.includes(offset) ? draft.notify.offsets.filter(value => value !== offset) : [...draft.notify.offsets, offset]
    updateNotify({ offsets: offsets.sort((left, right) => left - right) })
  }

  const handleSave = async () => {
    if (error) return
    const saved = await saveCycle({ ...draft, name: draft.name.trim(), icon: draft.icon.trim(), memo: draft.memo.trim() }, item?.id)
    if (!item && lastDate) await logCycle(saved.id, lastDate, DEVICE_PERSON)
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

      <main className="page-content cycle-form">
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
            <div className="cycle-targets" role="radiogroup" aria-label="대상">
              {TARGETS.map(target => (
                <button key={target} type="button" role="radio" aria-checked={draft.target === target} className="chip scope-chip" onClick={() => update({ target })}>
                  <PersonAvatar person={target} size={16} />
                  {target === '공동' ? target : personName(target)}
                </button>
              ))}
            </div>
          </div>
          <SwitchRow label="주기" hint={draft.period ? '마지막으로 한 날부터 다음까지 세요' : '다녀온 지 며칠 됐는지만 세요'} checked={draft.period !== null} onToggle={togglePeriod} />
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
          {!item && (
            <SwitchRow label="마지막으로 한 날 넣기" hint="모르면 꺼 두고, 처음 할 때 '했어요'를 눌러요" checked={lastDate !== null} onToggle={() => setLastDate(lastDate === null ? todayKey() : null)} />
          )}
          {!item && lastDate !== null && (
            <DateTimeRow
              label="마지막으로 한 날"
              pickerId="last"
              date={lastDate}
              time="12:00"
              showTime={false}
              opened={openedPicker}
              onToggle={picker => setOpenedPicker(previous => (previous === picker ? null : picker))}
              onDate={setLastDate}
              onTime={() => {}}
            />
          )}
        </section>

        <section className="form-group">
          <SwitchRow
            label="결제 기록과 연결"
            hint="맞는 결제가 있으면 그날을 마지막으로 한 날로 봐요"
            checked={draft.link !== null}
            onToggle={() => update({ link: draft.link ? null : { category: '', keyword: '', person: '' } })}
          />
          {draft.link && (
            <>
              <div className="form-row">
                <span>카테고리</span>
                <select
                  className="pill-input"
                  aria-label="연결할 카테고리"
                  value={draft.link.category}
                  onChange={event => update({ link: { ...draft.link!, category: event.target.value } })}
                >
                  <option value="">상관없음</option>
                  {expenseCategories.map(category => (
                    <option key={category.name} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <span>가맹점에 들어간 말</span>
                <input
                  className="tx-memo"
                  aria-label="가맹점에 들어간 말"
                  placeholder="예: 치과"
                  value={draft.link.keyword}
                  onChange={event => update({ link: { ...draft.link!, keyword: event.target.value } })}
                />
              </div>
              <div className="form-row">
                <span>결제한 사람</span>
                <select
                  className="pill-input"
                  aria-label="결제한 사람"
                  value={draft.link.person}
                  onChange={event => update({ link: { ...draft.link!, person: event.target.value as Person | '' } })}
                >
                  <option value="">누구든</option>
                  {PEOPLE.map(person => (
                    <option key={person} value={person}>
                      {personName(person)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </section>

        <section className="form-group">
          <SwitchRow label="폰 알림" hint="아침 9시에 알려요" checked={draft.notify.enabled} onToggle={() => updateNotify({ enabled: !draft.notify.enabled })} />
          {draft.notify.enabled && draft.period && (
            <div className="form-row">
              <span>언제</span>
              <div className="cycle-offsets">
                {NOTIFY_OFFSETS.map(offset => (
                  <button key={offset} type="button" role="checkbox" aria-checked={draft.notify.offsets.includes(offset)} className="chip" onClick={() => toggleOffset(offset)}>
                    {offsetLabel(offset)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {draft.notify.enabled && !draft.period && (
            <div className="form-row">
              <span>며칠 지나면</span>
              <div className="cycle-period">
                <input
                  className="pill-input cycle-number"
                  aria-label="며칠 지나면 알릴지"
                  inputMode="numeric"
                  value={draft.notify.afterDays ?? ''}
                  onChange={event => updateNotify({ afterDays: Number(event.target.value.replace(/\D/g, '')) || null })}
                />
                <span>일</span>
              </div>
            </div>
          )}
          {draft.notify.enabled && !isPushEnabled() && (
            <Link to="/settings" className="form-row cycle-push-hint">
              이 기기는 알림이 꺼져 있어요. 설정에서 켜야 받아요.
            </Link>
          )}
        </section>

        <section className="form-group">
          <div className="form-row">
            <span>메모</span>
            <input className="tx-memo" aria-label="메모" placeholder="남길 말" value={draft.memo} onChange={event => update({ memo: event.target.value })} />
          </div>
        </section>

        {item && <CycleLogs logs={logs} />}

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

// 잘못 누른 '했어요'도 나중에 바로잡을 수 있게, 지난 기록의 날짜를 고치거나 지운다.
function CycleLogs({ logs }: { logs: CycleLog[] }) {
  const personName = usePersonName()

  return (
    <section className="tx-section" aria-label="지난 기록">
      <h2 className="tx-section-title">지난 기록</h2>
      {logs.length === 0 ? (
        <p className="card-description">아직 직접 남긴 기록이 없어요.</p>
      ) : (
        <ul className="form-group cycle-logs">
          {logs.map(log => (
            <li key={log.id} className="form-row">
              <input
                className="pill-input"
                type="date"
                aria-label="기록한 날"
                value={log.date}
                onChange={event => event.target.value && updateCycleLog(log.id, event.target.value)}
              />
              <span className="cycle-log-person">{personName(log.person)}</span>
              <button type="button" className="text-button text-danger" onClick={() => deleteCycleLog(log.id)}>
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default CycleEditPage
