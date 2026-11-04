// 주기 관리: 교체 주기(D-day)와 다녀온 지(D+). 계산 규칙은 앱의 src/domain/cycle.ts와 같아야 한다(공통 사례로 검증).
const CYCLE_COLUMNS = ['id', '이름', '아이콘', '대상', '주기수', '주기단위', '연결카테고리', '연결가맹점', '연결사람', '알림', '알림시점', '경과알림일', '메모', '삭제', '수정시각', '동기화시각']
const CYCLE_LOG_COLUMNS = ['id', '항목id', '날짜', '사람', '삭제', '수정시각', '동기화시각']
const CYCLE_DAY_MS = 24 * 60 * 60 * 1000
const CYCLE_SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

function cycleSheets_(book) {
  return {
    items: ensureSheet_(book, SHEETS.cycles, CYCLE_COLUMNS, ['id', '이름', '아이콘', '연결가맹점', '알림시점', '메모', '수정시각', '동기화시각']),
    logs: ensureSheet_(book, SHEETS.cycleLogs, CYCLE_LOG_COLUMNS, ['id', '항목id', '날짜', '수정시각', '동기화시각']),
  }
}

function cycleText_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
  return String(value === undefined || value === null ? '' : value)
}

function cycleDateText_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd')
  return String(value || '')
}

function toCycleRow_(item, syncedAt) {
  return [
    item.id,
    item.name || '',
    item.icon || '',
    item.target,
    item.period ? item.period.amount : '',
    item.period ? item.period.unit : '',
    item.link ? item.link.category : '',
    item.link ? item.link.keyword : '',
    item.link ? item.link.person : '',
    item.notify.enabled === true,
    item.notify.offsets.join(','),
    item.notify.afterDays === null ? '' : item.notify.afterDays,
    item.memo || '',
    item.deleted === true,
    item.updatedAt,
    syncedAt,
  ]
}

function fromCycleRow_(row) {
  const hasLink = row['연결카테고리'] !== '' || row['연결가맹점'] !== '' || row['연결사람'] !== ''
  const offsets = cycleText_(row['알림시점'])
  return {
    id: cycleText_(row['id']),
    name: cycleText_(row['이름']),
    icon: cycleText_(row['아이콘']),
    target: cycleText_(row['대상']),
    period: row['주기수'] === '' ? null : { amount: Number(row['주기수']), unit: cycleText_(row['주기단위']) },
    link: hasLink ? { category: cycleText_(row['연결카테고리']), keyword: cycleText_(row['연결가맹점']), person: cycleText_(row['연결사람']) } : null,
    notify: {
      enabled: row['알림'] === true,
      offsets: offsets === '' ? [] : offsets.split(',').map(Number),
      afterDays: row['경과알림일'] === '' ? null : Number(row['경과알림일']),
    },
    memo: cycleText_(row['메모']),
    deleted: row['삭제'] === true,
    updatedAt: cycleText_(row['수정시각']),
  }
}

function toCycleLogRow_(log, syncedAt) {
  return [log.id, log.cycleId, log.date, log.person, log.deleted === true, log.updatedAt, syncedAt]
}

function fromCycleLogRow_(row) {
  return {
    id: cycleText_(row['id']),
    cycleId: cycleText_(row['항목id']),
    date: cycleDateText_(row['날짜']),
    person: cycleText_(row['사람']),
    deleted: row['삭제'] === true,
    updatedAt: cycleText_(row['수정시각']),
  }
}

function cyclePad_(value) {
  return String(value).padStart(2, '0')
}

function cycleUtcDate_(dateKey) {
  const parts = dateKey.split('-').map(Number)
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
}

function cycleKey_(date) {
  return `${date.getUTCFullYear()}-${cyclePad_(date.getUTCMonth() + 1)}-${cyclePad_(date.getUTCDate())}`
}

function cycleDaysBetween_(from, to) {
  return Math.round((cycleUtcDate_(to).getTime() - cycleUtcDate_(from).getTime()) / CYCLE_DAY_MS)
}

function cycleNormalize_(text) {
  return String(text).replace(/\s+/g, '').toLowerCase()
}

function addPeriod_(dateKey, period) {
  const date = cycleUtcDate_(dateKey)
  if (period.unit === 'day' || period.unit === 'week') {
    date.setUTCDate(date.getUTCDate() + period.amount * (period.unit === 'week' ? 7 : 1))
    return cycleKey_(date)
  }
  const months = period.amount * (period.unit === 'year' ? 12 : 1)
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return cycleKey_(target)
}

function isCycleLinkValid_(link) {
  return !!link && (String(link.category).trim() !== '' || String(link.keyword).trim() !== '')
}

function matchesCycleLink_(link, transaction) {
  if (transaction.deleted || transaction.kind !== '지출' || transaction.source === '이관' || transaction.source === '월합계') return false
  if (link.person && transaction.person !== link.person) return false
  if (link.category.trim() && transaction.category !== link.category.trim()) return false
  if (link.keyword.trim() && !cycleNormalize_(transaction.merchant).includes(cycleNormalize_(link.keyword))) return false
  return true
}

function lastPayment_(link, transactions) {
  if (!isCycleLinkValid_(link)) return null
  return transactions.reduce((latest, transaction) => {
    if (!matchesCycleLink_(link, transaction)) return latest
    const date = new Date(Date.parse(transaction.occurredAt) + CYCLE_SEOUL_OFFSET_MS).toISOString().slice(0, 10)
    return !latest || date > latest.date ? { date, merchant: transaction.merchant } : latest
  }, null)
}

function cycleState_(item, logs, transactions, today) {
  const lastLog = logs
    .filter(log => !log.deleted && log.cycleId === item.id)
    .reduce((latest, log) => (!latest || log.date > latest ? log.date : latest), null)
  const payment = item.link ? lastPayment_(item.link, transactions) : null
  const isPaymentLatest = !!payment && (!lastLog || payment.date > lastLog)
  const lastDate = isPaymentLatest ? payment.date : lastLog

  if (!lastDate) return { lastDate: null, lastSource: null, lastMerchant: '', nextDate: null, days: null }
  const nextDate = item.period ? addPeriod_(lastDate, item.period) : null
  return {
    lastDate,
    lastSource: isPaymentLatest ? 'payment' : 'log',
    lastMerchant: isPaymentLatest ? payment.merchant : '',
    nextDate,
    days: nextDate ? cycleDaysBetween_(today, nextDate) : cycleDaysBetween_(lastDate, today),
  }
}

function dueOffsetToday_(item, state) {
  if (!item.notify.enabled || state.days === null) return null
  if (item.period) return state.days >= 0 && item.notify.offsets.includes(state.days) ? state.days : null
  return item.notify.afterDays !== null && state.days === item.notify.afterDays ? state.days : null
}

const CYCLE_PEOPLE = ['쿠리만쥬', '우사기']
const CYCLE_SENT_KEY = 'CYCLE_SENT'
const CYCLE_SENT_KEEP_DAYS = 30
const CYCLE_TRIGGER_HOUR = 9

function cycleReminderTitle_(item, offset) {
  if (!item.period) return `${item.name} ${offset}일 지났어요`
  if (offset === 0) return `오늘 ${item.name} 하는 날이에요`
  return `${item.name} ${offset}일 남았어요`
}

// 오늘 보낼 알림을 고른다. 같은 주기·같은 시점 알림은 한 번만(key로 막는다).
function cycleReminders_(items, logs, transactions, today, sentKeys) {
  const sent = new Set(sentKeys)
  return items
    .filter(item => !item.deleted)
    .map(item => {
      const state = cycleState_(item, logs, transactions, today)
      const offset = dueOffsetToday_(item, state)
      if (offset === null) return null
      const key = `${item.id}|${state.lastDate}|${offset}`
      if (sent.has(key)) return null
      return {
        key,
        people: item.target === '공동' ? CYCLE_PEOPLE : [item.target],
        title: cycleReminderTitle_(item, offset),
        body: item.memo || '',
        link: `/cycles?id=${item.id}`,
      }
    })
    .filter(message => message !== null)
}

// 시간 트리거가 매일 아침 부른다.
function sendCycleReminders() {
  const book = SpreadsheetApp.getActive()
  if (!book.getSheetByName(SHEETS.cycles)) return
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd')
  const items = readObjects_(book.getSheetByName(SHEETS.cycles)).map(fromCycleRow_)
  const logs = book.getSheetByName(SHEETS.cycleLogs) ? readObjects_(book.getSheetByName(SHEETS.cycleLogs)).map(fromCycleLogRow_) : []
  const transactions = readObjects_(book.getSheetByName(SHEETS.transactions)).map(fromRow_)

  const properties = PropertiesService.getScriptProperties()
  const sentAt = JSON.parse(properties.getProperty(CYCLE_SENT_KEY) || '{}')
  const messages = cycleReminders_(items, logs, transactions, today, Object.keys(sentAt))
  messages.forEach(message => {
    sendPushTo_(message.people, { title: message.title, body: message.body, link: message.link })
    sentAt[message.key] = today
  })

  const oldest = Utilities.formatDate(new Date(Date.now() - CYCLE_SENT_KEEP_DAYS * CYCLE_DAY_MS), 'Asia/Seoul', 'yyyy-MM-dd')
  Object.keys(sentAt).forEach(key => {
    if (sentAt[key] < oldest) delete sentAt[key]
  })
  properties.setProperty(CYCLE_SENT_KEY, JSON.stringify(sentAt))
  Logger.log('주기 알림 %s건', messages.length)
}

// 편집기에서 한 번 실행해 매일 아침 9시 트리거를 건다. 다시 실행해도 하나만 남는다.
function installCycleTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'sendCycleReminders')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger))
  ScriptApp.newTrigger('sendCycleReminders').timeBased().everyDays(1).atHour(CYCLE_TRIGGER_HOUR).inTimezone('Asia/Seoul').create()
  Logger.log('주기 알림 트리거를 걸었어요')
}
