// 주기 항목을 시트에 저장한다. 마지막 날·예약 계산은 앱이 캘린더 일정으로 한다.
// 일정키워드·기준일은 나중에 더한 열이라 맨 끝에 둔다.
const CYCLE_COLUMNS = ['id', '이름', '아이콘', '대상', '주기수', '주기단위', '연결카테고리', '연결가맹점', '연결사람', '알림', '알림시점', '경과알림일', '메모', '삭제', '수정시각', '동기화시각', '일정키워드', '기준일']
const CYCLE_ADDED_COLUMNS = ['일정키워드', '기준일']

function cycleSheet_(book) {
  const sheet = ensureSheet_(book, SHEETS.cycles, CYCLE_COLUMNS, ['id', '이름', '아이콘', '메모', '수정시각', '동기화시각', '일정키워드', '기준일'])
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  CYCLE_ADDED_COLUMNS.filter(column => !header.includes(column)).forEach(column => {
    const index = CYCLE_COLUMNS.indexOf(column) + 1
    sheet.getRange(1, index).setValue(column).setFontWeight('bold')
    sheet.getRange(1, index, sheet.getMaxRows(), 1).setNumberFormat('@')
  })
  return sheet
}

function cycleText_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
  return String(value === undefined || value === null ? '' : value)
}

function cycleDateText_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd')
  return String(value === undefined || value === null ? '' : value)
}

function toCycleRow_(item, syncedAt) {
  return [
    item.id,
    item.name || '',
    item.icon || '',
    item.target,
    item.period ? item.period.amount : '',
    item.period ? item.period.unit : '',
    // 결제 연결(연결카테고리·연결가맹점·연결사람)은 없앤 기능이라 비워 둔다. 열 위치는 옛 행과 맞추려고 남긴다.
    '',
    '',
    '',
    // 폰 알림(알림·알림시점·경과알림일)도 없앤 기능이라 비워 둔다.
    '',
    '',
    '',
    item.memo || '',
    item.deleted === true,
    item.updatedAt,
    syncedAt,
    item.keyword || '',
    item.anchor || '',
  ]
}

function fromCycleRow_(row) {
  return {
    id: cycleText_(row['id']),
    name: cycleText_(row['이름']),
    icon: cycleText_(row['아이콘']),
    target: cycleText_(row['대상']),
    keyword: cycleText_(row['일정키워드']),
    anchor: cycleDateText_(row['기준일']) || null,
    period: row['주기수'] === '' ? null : { amount: Number(row['주기수']), unit: cycleText_(row['주기단위']) },
    memo: cycleText_(row['메모']),
    deleted: row['삭제'] === true,
    updatedAt: cycleText_(row['수정시각']),
  }
}

// 편집기에서 한 번 실행해, 예전에 건 아침 알림 트리거와 보낸 기록을 지운다.
function removeCycleTrigger() {
  const triggers = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'sendCycleReminders')
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger))
  PropertiesService.getScriptProperties().deleteProperty('CYCLE_SENT')
  Logger.log('주기 알림 트리거 %s개를 지웠어요', triggers.length)
}
