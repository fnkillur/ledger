import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import CalendarEventForm from '../components/calendar/CalendarEventForm'
import { db } from '../db/database'
import type { CalendarEvent } from '../domain/calendar'
import { toDateKey } from '../utils/format'
import NotFoundPage from './NotFoundPage'

const todayKey = () => toDateKey(new Date().toISOString())

// 링크로 바로 들어온 경우를 위한 전체 화면 폼. 캘린더 안에서는 날짜 시트 안의 폼을 쓴다.
function CalendarEventPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const passed = (location.state as { event?: CalendarEvent } | null)?.event
  const cached = useLiveQuery(async () => {
    if (!id || passed) return null
    return (await db.calendarEvents.get(id)) ?? null
  }, [id, passed])

  const event = passed ?? cached ?? undefined

  // 링크로 이 화면부터 열렸으면 돌아갈 화면이 없으므로 캘린더로 간다.
  const goBack = () => (location.key === 'default' ? navigate('/', { replace: true }) : navigate(-1))

  if (id && !passed && cached === undefined) return null
  if (id && !event) return <NotFoundPage />
  return (
    <div className="page">
      <CalendarEventForm event={event} date={searchParams.get('date') ?? todayKey()} layout="page" onDone={goBack} onCancel={goBack} />
    </div>
  )
}

export default CalendarEventPage
