// 쿠리만쥬 일정에 저녁 7시 필라테스가 있는 날, 오전 11시에 "테이크아웃 받기" 알림을 쿠리만쥬 앱(안드로이드)에만 보낸다.
// 시간 트리거는 정한 시각부터 한 시간 안 아무 때나 돌아서, 아침에 일정을 보고 11시 정각에 한 번 도는 트리거를 따로 건다.
const TAKEOUT = { person: '쿠리만쥬', keyword: '필라테스', hour: 19, sendHour: 11, title: '테이크아웃 받기', body: '오늘 저녁 7시 필라테스가 있어요' }
const KST_OFFSET_HOURS = 9

const kstHourOf_ = iso => (new Date(iso).getUTCHours() + KST_OFFSET_HOURS) % 24
const kstMinuteOf_ = iso => new Date(iso).getUTCMinutes()

function isTakeoutDay_(events) {
  return events.some(
    event =>
      event.target === TAKEOUT.person &&
      !event.allDay &&
      event.title.includes(TAKEOUT.keyword) &&
      kstHourOf_(event.start) === TAKEOUT.hour &&
      kstMinuteOf_(event.start) === 0,
  )
}

function sendTakeoutPush_(dateKey) {
  sendPushTo_([TAKEOUT.person], { title: TAKEOUT.title, body: TAKEOUT.body, date: dateKey }, ['android'])
}

function todayKey_() {
  return Utilities.formatDate(new Date(), CALENDAR_TIME_ZONE, 'yyyy-MM-dd')
}

function deleteTriggersOf_(handler) {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger))
}

// 매일 9시대에 돈다.
function planTakeoutReminder() {
  const today = todayKey_()
  deleteTriggersOf_('sendTakeoutReminder')
  if (!isTakeoutDay_(calendarEvents_(today, today).events)) return
  ScriptApp.newTrigger('sendTakeoutReminder').timeBased().at(new Date(`${today}T${String(TAKEOUT.sendHour).padStart(2, '0')}:00:00+09:00`)).create()
}

// 9시 뒤에 일정을 지웠거나 옮겼으면 보내지 않는다.
function sendTakeoutReminder() {
  deleteTriggersOf_('sendTakeoutReminder')
  const today = todayKey_()
  if (isTakeoutDay_(calendarEvents_(today, today).events)) sendTakeoutPush_(today)
}

// 편집기에서 한 번 실행해 매일 아침 트리거를 건다. 다시 실행해도 하나만 남는다.
function installTakeoutReminder() {
  deleteTriggersOf_('planTakeoutReminder')
  ScriptApp.newTrigger('planTakeoutReminder').timeBased().atHour(9).everyDays(1).inTimezone(CALENDAR_TIME_ZONE).create()
  Logger.log('매일 아침 필라테스 일정을 확인해요.')
}

// 편집기에서 실행하면 지금 쿠리만쥬 앱으로 알림을 한 번 보내 본다.
function testTakeoutReminder() {
  sendTakeoutPush_(todayKey_())
}
