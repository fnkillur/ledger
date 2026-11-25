const CALENDAR_TIME_ZONE = 'Asia/Seoul'
const CALENDAR_TARGETS = ['공동', '쿠리만쥬', '우사기', '기념일', '없음']
// 구글 캘린더 앱에서도 대상이 구분되도록 앱과 같은 계열(공동 그래파이트·쿠리만쥬 세이지·우사기 바나나·기념일 포도·지정일 토마토)로 칠한다.
const TARGET_COLOR_IDS = { 공동: '8', 쿠리만쥬: '2', 우사기: '5', 기념일: '3', 없음: '11' }
// Apps Script 실행 제한(6분) 안에 끝나도록 색 바꾸기는 이만큼만 하고 다음 요청에 이어서 한다.
const RECOLOR_TIME_BUDGET_MS = 4 * 60 * 1000
const REPEAT_FREQS = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }
const CALENDAR_IMPORT_LIMIT = 100
const HOLIDAY_CALENDAR_ID = 'ko.south_korea#holiday@group.v.calendar.google.com'

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

  const repeatBySeries = seriesRepeats_(id, items.map(item => item.recurringEventId).filter(Boolean))
  return { events: items.filter(item => item.status !== 'cancelled').map(item => toCalendarEvent_(item, repeatBySeries)), holidays: holidays_(start, end) }
}

// 반복 종류는 시리즈 원본을 따로 물어봐야 알 수 있어서, 한 번 물어본 건 서버에 기억해 둔다.
// 시리즈를 고치거나 지우면(앱에서든 구글 캘린더에서든) 바뀐 것 확인 때 지운다.
const REPEAT_CACHE_SECONDS = 6 * 60 * 60
const repeatCacheKey_ = seriesId => `repeat:${seriesId}`

function seriesRepeats_(calendar, seriesIds) {
  const ids = [...new Set(seriesIds)]
  if (ids.length === 0) return {}
  const cache = CacheService.getScriptCache()
  const cached = cache.getAll(ids.map(repeatCacheKey_))
  const repeats = {}
  const fresh = {}
  ids.forEach(seriesId => {
    const hit = cached[repeatCacheKey_(seriesId)]
    if (hit) {
      repeats[seriesId] = hit
      return
    }
    repeats[seriesId] = repeatOf_(Calendar.Events.get(calendar, seriesId).recurrence)
    fresh[repeatCacheKey_(seriesId)] = repeats[seriesId]
  })
  if (Object.keys(fresh).length > 0) cache.putAll(fresh, REPEAT_CACHE_SECONDS)
  return repeats
}

function forgetRepeats_(seriesIds) {
  const keys = seriesIds.filter(Boolean).map(repeatCacheKey_)
  if (keys.length > 0) CacheService.getScriptCache().removeAll(keys)
}

// 지난번 확인 이후 바뀐 일정(앱·구글 캘린더 어디서 바꿨든)만 알려 준다. 앱은 이걸로 다시 받을 달만 고른다.
// 처음이거나 구글이 확인 번호를 버렸으면(410) 새 번호만 주고, 앱이 보고 있는 달부터 새로 받게 한다.
// 구글은 확인 번호를 받을 때와 쓸 때 조건이 같아야 해서, 처음 받을 때도 maxResults 말고는 아무 조건을 걸지 않는다.
function calendarChanges_(syncToken) {
  const id = calendarId_()
  if (!syncToken) return { syncToken: freshSyncToken_(id) }
  const items = []
  let pageToken
  let nextSyncToken
  try {
    do {
      const page = Calendar.Events.list(id, {
        syncToken,
        pageToken,
        maxResults: 2500,
        fields: 'nextPageToken,nextSyncToken,items(id,status,start,end,originalStartTime,recurringEventId,recurrence)',
      })
      items.push(...(page.items || []))
      pageToken = page.nextPageToken
      nextSyncToken = page.nextSyncToken
    } while (pageToken)
  } catch (error) {
    if (!/410|sync token|full sync/i.test(String(error && error.message))) throw error
    return { reset: true, syncToken: freshSyncToken_(id) }
  }
  forgetRepeats_(items.filter(item => item.recurrence || item.status === 'cancelled').map(item => item.id))
  return { syncToken: nextSyncToken, changes: items.map(toCalendarChange_) }
}

function freshSyncToken_(calendar) {
  let pageToken
  for (;;) {
    const page = Calendar.Events.list(calendar, { pageToken, maxResults: 2500, fields: 'nextPageToken,nextSyncToken' })
    if (page.nextSyncToken) return page.nextSyncToken
    pageToken = page.nextPageToken
  }
}

const eventTime_ = (time, isEnd) => {
  if (!time) return null
  if (time.date) return isEnd ? addDays_(time.date, -1) : time.date
  return time.dateTime || null
}

// 지운 일정은 번호만 오고 날짜가 없다. 앱이 받아 둔 일정에서 그 번호로 달을 찾는다.
function toCalendarChange_(item) {
  return {
    id: item.id,
    seriesId: item.recurringEventId || null,
    isSeries: !!item.recurrence,
    start: eventTime_(item.start, false),
    end: eventTime_(item.end, true),
    originalStart: item.originalStartTime ? item.originalStartTime.date || item.originalStartTime.dateTime : null,
  }
}

// 구글 공휴일 캘린더는 어버이날 같은 기념일도 섞여 있어서, 설명이 '공휴일'인 쉬는 날만 고른다.
// 공휴일은 거의 안 바뀌어서 해마다 받아 서버에 기억해 둔다.
// 공휴일을 못 받아도 일정은 보여야 하니 실패하면 비워 두고, 앱은 받아 둔 공휴일을 그대로 쓴다.
const HOLIDAY_CACHE_SECONDS = 6 * 60 * 60

function holidays_(start, end) {
  try {
    const years = []
    for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year += 1) years.push(year)
    return years.flatMap(holidaysOfYear_).filter(holiday => holiday.date >= start && holiday.date <= end)
  } catch (error) {
    console.warn(`공휴일을 받지 못했어요: ${error}`)
    return undefined
  }
}

function holidaysOfYear_(year) {
  const cache = CacheService.getScriptCache()
  const cached = cache.get(`holidays:${year}`)
  if (cached) return JSON.parse(cached)
  const page = Calendar.Events.list(HOLIDAY_CALENDAR_ID, {
    timeMin: `${year}-01-01T00:00:00+09:00`,
    timeMax: `${year + 1}-01-01T00:00:00+09:00`,
    singleEvents: true,
    maxResults: 2500,
  })
  const holidays = (page.items || [])
    .filter(item => item.start.date && String(item.description || '').trim() === '공휴일')
    .map(item => ({ date: item.start.date, name: item.summary || '공휴일' }))
  cache.put(`holidays:${year}`, JSON.stringify(holidays), HOLIDAY_CACHE_SECONDS)
  return holidays
}

function saveCalendarEvent_(body) {
  const input = body.event || {}
  validateCalendarInput_(input)
  const id = calendarId_()
  const ref = input.ref

  if (!ref) return insertOnce_(toEventResource_(input, true), id, body.createId)
  if (!ref.seriesId) return { id: updateWhole_(id, ref.id, input, true).id }

  const scope = body.scope || 'all'
  if (scope === 'one') return { id: updateWhole_(id, ref.id, input, false).id }

  const master = Calendar.Events.get(id, ref.seriesId)
  if (scope === 'following' && !isFirstOccurrence_(master, ref)) {
    Calendar.Events.patch({ recurrence: endRecurrenceBefore_(master.recurrence, ref.originalStart) }, id, master.id)
    const resource = toEventResource_(input, true)
    if (keepsRepeat_(input, master)) resource.recurrence = continueRecurrence_(master.recurrence)
    return insertOnce_(resource, id, body.createId)
  }
  // 반복을 끄고 전체에 적용하면, 보던 회차 날짜에 일정 하나만 남긴다.
  const isEndingRepeat = input.repeat === 'none' && !input.rrule
  return { id: updateWhole_(id, master.id, isEndingRepeat ? input : shiftToSeriesStart_(input, master, ref), true).id }
}

// 지운 일정의 제목과 날짜를 돌려줘 상대에게 알린다. 이미 지워진 일정이면(다시 보낸 요청) null.
function deleteCalendarEvent_(body) {
  const ref = body.ref || {}
  if (!ref.id) throw new Error('지울 일정을 찾지 못했어요.')
  const id = calendarId_()
  const scope = body.scope || 'all'

  if (!ref.seriesId || scope === 'one') {
    const event = findEvent_(id, ref.id)
    removeOnce_(id, ref.id)
    return event && deletedNotice_(event)
  }
  const master = Calendar.Events.get(id, ref.seriesId)
  if (scope === 'following' && !isFirstOccurrence_(master, ref)) {
    Calendar.Events.patch({ recurrence: endRecurrenceBefore_(master.recurrence, ref.originalStart) }, id, master.id)
    return { title: master.summary || '', start: ref.start || ref.originalStart }
  }
  removeOnce_(id, master.id)
  // 반복 일정은 시리즈 첫날 대신 지운 사람이 보던 회차 날짜로 알린다.
  return { title: master.summary || '', start: ref.start || ref.originalStart || dateKeyOfEventTime_(master.start) }
}

function findEvent_(calendar, eventId) {
  try {
    const event = Calendar.Events.get(calendar, eventId)
    return event.status === 'cancelled' ? null : event
  } catch (error) {
    return null
  }
}

function deletedNotice_(event) {
  return { title: event.summary || '', start: event.start.date || event.start.dateTime }
}

// 앱은 응답을 못 받은 작업을 다시 보낸다. 앱이 정한 번호로 만들어서, 다시 온 요청이면 이미 만든 일정을 돌려준다.
// 번호 없이 보내는 옛 앱은 예전처럼 새로 만든다.
function insertOnce_(resource, calendar, createId) {
  if (!isEventId_(createId)) return { id: Calendar.Events.insert(resource, calendar).id, isNew: true }
  try {
    return { id: Calendar.Events.insert(Object.assign({}, resource, { id: createId }), calendar).id, isNew: true }
  } catch (error) {
    if (!/already exists|duplicate/i.test(String(error && error.message))) throw error
    return { id: createId, isNew: false }
  }
}

// 다시 온 삭제 요청이면 이미 지워진 일정이라, 없다는 오류는 성공으로 본다.
function removeOnce_(calendar, eventId) {
  try {
    Calendar.Events.remove(calendar, eventId)
  } catch (error) {
    if (!/deleted|not found/i.test(String(error && error.message))) throw error
  }
}

// 구글 캘린더 일정 번호: 소문자 a~v와 숫자, 5~1024자.
function isEventId_(value) {
  return typeof value === 'string' && /^[0-9a-v]{5,1024}$/.test(value)
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
