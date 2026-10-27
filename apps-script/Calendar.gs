const CALENDAR_TIME_ZONE = 'Asia/Seoul'
const CALENDAR_TARGETS = ['공동', '쿠리만쥬', '우사기', '기념일', '없음']
// 구글 캘린더 앱에서도 대상이 구분되도록 앱과 같은 계열(공동 그래파이트·쿠리만쥬 세이지·우사기 바나나·기념일 포도·지정일 토마토)로 칠한다.
const TARGET_COLOR_IDS = { 공동: '8', 쿠리만쥬: '2', 우사기: '5', 기념일: '3', 없음: '11' }
// Apps Script 실행 제한(6분) 안에 끝나도록 색 바꾸기는 이만큼만 하고 다음 요청에 이어서 한다.
const RECOLOR_TIME_BUDGET_MS = 4 * 60 * 1000
const REPEAT_FREQS = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }
const CALENDAR_IMPORT_LIMIT = 100

// 편집기에서 한 번 실행해 캘린더 권한을 허용한다.
function authorizeCalendar() {
  Calendar.CalendarList.list({ maxResults: 1 })
}

function calendarId_() {
  const id = typeof CALENDAR_ID !== 'undefined' ? CALENDAR_ID : PropertiesService.getScriptProperties().getProperty('CALENDAR_ID')
  if (!id) throw new Error('캘린더가 연결되지 않았어요.')
  return id
}

function calendarEvents_(start, end) {
  if (!isDateKey_(start) || !isDateKey_(end)) throw new Error('기간이 올바르지 않아요.')
  const id = calendarId_()
  const items = []
  let pageToken
  do {
    const page = Calendar.Events.list(id, {
      timeMin: `${start}T00:00:00+09:00`,
      timeMax: `${addDays_(end, 1)}T00:00:00+09:00`,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    })
    items.push(...(page.items || []))
    pageToken = page.nextPageToken
  } while (pageToken)

  const repeatBySeries = {}
  items
    .filter(item => item.recurringEventId && !(item.recurringEventId in repeatBySeries))
    .forEach(item => {
      repeatBySeries[item.recurringEventId] = repeatOf_(Calendar.Events.get(id, item.recurringEventId).recurrence)
    })

  return { events: items.filter(item => item.status !== 'cancelled').map(item => toCalendarEvent_(item, repeatBySeries)) }
}

function saveCalendarEvent_(body) {
  const input = body.event || {}
  validateCalendarInput_(input)
  const id = calendarId_()
  const ref = input.ref

  if (!ref) return { id: Calendar.Events.insert(toEventResource_(input, true), id).id }
  if (!ref.seriesId) return { id: updateWhole_(id, ref.id, input, true).id }

  const scope = body.scope || 'all'
  if (scope === 'one') return { id: updateWhole_(id, ref.id, input, false).id }

  const master = Calendar.Events.get(id, ref.seriesId)
  if (scope === 'following' && !isFirstOccurrence_(master, ref)) {
    Calendar.Events.patch({ recurrence: endRecurrenceBefore_(master.recurrence, ref.originalStart) }, id, master.id)
    const resource = toEventResource_(input, true)
    if (keepsRepeat_(input, master)) resource.recurrence = continueRecurrence_(master.recurrence)
    return { id: Calendar.Events.insert(resource, id).id }
  }
  // 반복을 끄고 전체에 적용하면, 보던 회차 날짜에 일정 하나만 남긴다.
  const isEndingRepeat = input.repeat === 'none' && !input.rrule
  return { id: updateWhole_(id, master.id, isEndingRepeat ? input : shiftToSeriesStart_(input, master, ref), true).id }
}

function deleteCalendarEvent_(body) {
  const ref = body.ref || {}
  if (!ref.id) throw new Error('지울 일정을 찾지 못했어요.')
  const id = calendarId_()
  const scope = body.scope || 'all'

  if (!ref.seriesId) {
    Calendar.Events.remove(id, ref.id)
    return {}
  }
  if (scope === 'one') {
    Calendar.Events.remove(id, ref.id)
    return {}
  }
  const master = Calendar.Events.get(id, ref.seriesId)
  if (scope === 'following' && !isFirstOccurrence_(master, ref)) {
    Calendar.Events.patch({ recurrence: endRecurrenceBefore_(master.recurrence, ref.originalStart) }, id, master.id)
    return {}
  }
  Calendar.Events.remove(id, master.id)
  return {}
}

function importCalendarEvents_(body) {
  const events = body.events || []
  if (events.length > CALENDAR_IMPORT_LIMIT) throw new Error(`한 번에 ${CALENDAR_IMPORT_LIMIT}건까지 보낼 수 있어요.`)
  const id = calendarId_()
  let added = 0
  let skipped = 0
  events.forEach(event => {
    if (!event.uid) throw new Error('가져올 일정에 uid가 없어요.')
    validateCalendarInput_(event)
    const existing = Calendar.Events.list(id, { privateExtendedProperty: `uid=${event.uid}`, maxResults: 1, showDeleted: false })
    if ((existing.items || []).length > 0) {
      skipped += 1
      return
    }
    const resource = toEventResource_(event, true)
    resource.extendedProperties.private.uid = String(event.uid)
    if (event.description) resource.description = String(event.description)
    if (event.location) resource.location = String(event.location)
    Calendar.Events.insert(resource, id)
    added += 1
  })
  return { added, skipped }
}

// 색 매핑을 바꿨을 때 이미 있는 일정의 색을 맞춘다. 끝나지 않았으면 done: false를 돌려줘 다시 부르게 한다.
function recolorCalendarEvents_() {
  const id = calendarId_()
  const startedAt = Date.now()
  let updated = 0
  let pageToken
  do {
    const page = Calendar.Events.list(id, { maxResults: 2500, pageToken, showDeleted: false })
    for (const item of page.items || []) {
      if (item.status === 'cancelled') continue
      const target = item.extendedProperties && item.extendedProperties.private && item.extendedProperties.private.target
      const colorId = TARGET_COLOR_IDS[CALENDAR_TARGETS.includes(target) ? target : '없음']
      if (item.colorId === colorId) continue
      if (Date.now() - startedAt > RECOLOR_TIME_BUDGET_MS) return { updated, done: false }
      Calendar.Events.patch({ colorId }, id, item.id)
      updated += 1
    }
    pageToken = page.nextPageToken
  } while (pageToken)
  return { updated, done: true }
}

// 다른 앱에서 넣은 설명·알림 같은 값은 지우지 않도록, 원본을 받아 바꿀 값만 덮어쓴다.
// patch는 start/end를 합쳐서 하루 종일 ↔ 시간 전환이 깨지므로 update로 통째로 바꾼다.
function updateWhole_(calendar, eventId, input, withRecurrence) {
  const current = Calendar.Events.get(calendar, eventId)
  const next = toEventResource_(input, withRecurrence)
  // 반복 종류를 그대로 두면 UNTIL·간격·요일·예외 날짜 같은 원래 규칙을 지킨다.
  if (withRecurrence && keepsRepeat_(input, current)) next.recurrence = current.recurrence
  const merged = Object.assign({}, current, next, {
    extendedProperties: {
      private: Object.assign({}, (current.extendedProperties && current.extendedProperties.private) || {}, next.extendedProperties.private),
      shared: (current.extendedProperties && current.extendedProperties.shared) || {},
    },
  })
  if (withRecurrence && !next.recurrence) delete merged.recurrence
  return Calendar.Events.update(merged, calendar, eventId)
}

function keepsRepeat_(input, event) {
  return !input.rrule && !input.recurrence && !!event.recurrence && repeatOf_(event.recurrence) === input.repeat
}

// 나눠서 새로 시작하는 시리즈는 원래 규칙을 이어받되, 횟수 제한과 예외 날짜는 앞 시리즈 몫이라 뺀다.
function continueRecurrence_(recurrence) {
  return (recurrence || [])
    .filter(line => line.startsWith('RRULE:'))
    .map(line => `RRULE:${line.slice('RRULE:'.length).split(';').filter(part => !part.startsWith('COUNT=')).join(';')}`)
}

// 반복 전체를 고칠 때는 고른 회차가 아니라 시리즈 첫 회차를 기준으로, 옮긴 날짜 수만큼만 시작일을 옮긴다.
function shiftToSeriesStart_(input, master, ref) {
  // 이미 따로 옮겨 둔 회차라면, 원래 날짜가 아니라 지금 날짜에서 얼마나 옮겼는지만 반영한다.
  const dayShift = daysBetween_(dateKeyOf_(ref.start || ref.originalStart), dateKeyOf_(input.start))
  const seriesStartDay = addDays_(dateKeyOfEventTime_(master.start), dayShift)
  const lengthDays = daysBetween_(dateKeyOf_(input.start), dateKeyOf_(input.end))
  if (input.allDay) return Object.assign({}, input, { start: seriesStartDay, end: addDays_(seriesStartDay, lengthDays) })
  return Object.assign({}, input, {
    start: `${seriesStartDay}T${timeOf_(input.start)}+09:00`,
    end: `${addDays_(seriesStartDay, lengthDays)}T${timeOf_(input.end)}+09:00`,
  })
}

function isFirstOccurrence_(master, ref) {
  return dateKeyOf_(ref.originalStart) === dateKeyOfEventTime_(master.start)
}

function endRecurrenceBefore_(recurrence, originalStart) {
  const until = isDateKey_(originalStart)
    ? addDays_(originalStart, -1).replace(/-/g, '')
    : Utilities.formatDate(new Date(new Date(originalStart).getTime() - 1000), 'UTC', "yyyyMMdd'T'HHmmss'Z'")
  return (recurrence || []).map(line => {
    if (!line.startsWith('RRULE:')) return line
    const parts = line
      .slice('RRULE:'.length)
      .split(';')
      .filter(part => !part.startsWith('UNTIL=') && !part.startsWith('COUNT='))
    return `RRULE:${[...parts, `UNTIL=${until}`].join(';')}`
  })
}

function toEventResource_(input, withRecurrence) {
  const target = input.target
  const resource = {
    summary: String(input.title).trim(),
    start: input.allDay ? { date: input.start } : { dateTime: input.start, timeZone: CALENDAR_TIME_ZONE },
    end: input.allDay ? { date: addDays_(input.end, 1) } : { dateTime: input.end, timeZone: CALENDAR_TIME_ZONE },
    colorId: TARGET_COLOR_IDS[target],
    extendedProperties: { private: { target } },
  }
  if (!withRecurrence) return resource
  if (Array.isArray(input.recurrence)) resource.recurrence = input.recurrence.filter(line => /^(RRULE|EXDATE|RDATE)[:;]/.test(String(line))).map(String)
  else if (input.rrule) resource.recurrence = [String(input.rrule).startsWith('RRULE:') ? String(input.rrule) : `RRULE:${input.rrule}`]
  else if (REPEAT_FREQS[input.repeat]) resource.recurrence = [`RRULE:FREQ=${REPEAT_FREQS[input.repeat]}`]
  return resource
}

function toCalendarEvent_(item, repeatBySeries) {
  const allDay = !!item.start.date
  const target = item.extendedProperties && item.extendedProperties.private && item.extendedProperties.private.target
  return {
    id: item.id,
    seriesId: item.recurringEventId || null,
    originalStart: item.originalStartTime ? item.originalStartTime.date || item.originalStartTime.dateTime : null,
    title: item.summary || '',
    allDay,
    start: allDay ? item.start.date : item.start.dateTime,
    end: allDay ? addDays_(item.end.date, -1) : item.end.dateTime,
    target: CALENDAR_TARGETS.includes(target) ? target : '없음',
    repeat: item.recurringEventId ? repeatBySeries[item.recurringEventId] : repeatOf_(item.recurrence),
  }
}

function repeatOf_(recurrence) {
  const rule = (recurrence || []).find(line => line.startsWith('RRULE:')) || ''
  const freq = (rule.match(/FREQ=(\w+)/) || [])[1]
  return Object.keys(REPEAT_FREQS).find(repeat => REPEAT_FREQS[repeat] === freq) || 'none'
}

function validateCalendarInput_(input) {
  if (!String(input.title || '').trim()) throw new Error('일정 제목을 입력해 주세요.')
  if (!CALENDAR_TARGETS.includes(input.target)) throw new Error('대상이 올바르지 않아요.')
  if (input.allDay && (!isDateKey_(input.start) || !isDateKey_(input.end))) throw new Error('날짜가 올바르지 않아요.')
  if (!input.allDay && (isNaN(new Date(input.start)) || isNaN(new Date(input.end)))) throw new Error('시간이 올바르지 않아요.')
  if (dateKeyOf_(input.end) < dateKeyOf_(input.start) || (!input.allDay && new Date(input.end) < new Date(input.start))) {
    throw new Error('끝이 시작보다 빨라요.')
  }
}

function isDateKey_(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value))
}

function dateKeyOf_(value) {
  return isDateKey_(value) ? value : Utilities.formatDate(new Date(value), CALENDAR_TIME_ZONE, 'yyyy-MM-dd')
}

function dateKeyOfEventTime_(time) {
  return time.date || dateKeyOf_(time.dateTime)
}

function timeOf_(iso) {
  return Utilities.formatDate(new Date(iso), CALENDAR_TIME_ZONE, 'HH:mm:ss')
}

function addDays_(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Utilities.formatDate(new Date(Date.UTC(year, month - 1, day + days)), 'UTC', 'yyyy-MM-dd')
}

function daysBetween_(fromKey, toKey) {
  const toUtc = key => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86400000)
}
