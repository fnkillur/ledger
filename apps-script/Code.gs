const SHEETS = {
  transactions: '거래내역',
  categories: '카테고리',
  rules: '분류규칙',
  settings: '설정',
  captures: '수집함',
}

const TRANSACTION_COLUMNS = [
  'id',
  '일시',
  '사람',
  '구분',
  '금액',
  '인원',
  '가맹점',
  '카테고리',
  '통계제외',
  '출처',
  '메모',
  '원문',
  '삭제',
  '수정시각',
  '동기화시각',
  '공동개인',
]

const CATEGORY_COLUMNS = ['구분', '이름', '순서', '통계제외', '고정비', '아이콘', '개인지출']
const SETTING_COLUMNS = ['키', '값', '수정시각']
const RULE_COLUMNS = ['키워드', '카테고리', '수정시각', '동기화시각']
// iOS 단축어가 보낸 결제 문자. 앱이 확인한 뒤 기록하거나 무시하면 상태를 바꾼다.
const CAPTURE_COLUMNS = ['키', '받은시각', '사람', '내용', '상태', '동기화시각']
const CAPTURE_STATUSES = ['대기', '기록됨', '무시']

// [구분, 이름, 아이콘, 옵션]
const DEFAULT_CATEGORIES = [
  ['지출', '편의점·마트·잡화', '🛒'],
  ['지출', '여행·숙박', '✈️'],
  ['지출', '쇼핑', '🛍️', { personal: true }],
  ['지출', '식비', '🍚'],
  ['지출', '교통·자동차', '🚗'],
  ['지출', '주거·통신', '🏠', { fixed: true }],
  ['지출', '보험·세금·기타금융', '🧾', { fixed: true }],
  ['지출', '의료·건강·피트니스', '💊'],
  ['지출', '취미·여가', '🎮', { personal: true }],
  ['지출', '카페·간식', '☕'],
  ['지출', '술·유흥', '🍺'],
  ['지출', '미용', '💇', { personal: true }],
  ['지출', '생활', '🧺'],
  ['지출', '원두', '🫘'],
  ['지출', '과자', '🍪'],
  ['지출', '모임계', '👥', { fixed: true, personal: true }],
  ['지출', '부모님용돈', '👵'],
  ['지출', '선물', '🎁'],
  ['지출', '교육', '📚', { personal: true }],
  ['지출', '축의금', '💐'],
  ['지출', '카드대금', '💳', { fixed: true }],
  ['지출', '카테고리 없음', '❔'],
  ['수입', '월급', '💼'],
  ['수입', '은행이자지원', '🏦'],
  ['수입', '연말정산', '🧮'],
  ['수입', '보험금환급', '🩹'],
  ['수입', '상여(출장포함)', '🎉'],
  ['수입', '배당금', '📈'],
  ['수입', 'K패스환급', '🚇'],
  ['수입', '인터넷환급', '🌐'],
  ['수입', '정산', '🔁', { excluded: true }],
  ['저축', '저축·투자', '🐷', { excluded: true }],
]

const DEFAULT_SETTINGS = [
  ['월예산', 0],
  ['월저축목표', 0],
]

// 기존 연도 탭의 카테고리 이름 → 새 카테고리 (이름이 바뀐 것만)
const LEGACY_CATEGORY_ALIASES = {
  코스트코정산: '정산',
  상여: '상여(출장포함)',
}

function setup() {
  const book = SpreadsheetApp.getActive()
  ensureSheet_(book, SHEETS.transactions, TRANSACTION_COLUMNS, ['id', '일시', '수정시각', '동기화시각'])
  ensureSheet_(book, SHEETS.rules, RULE_COLUMNS, ['수정시각', '동기화시각'])
  const categorySheet = ensureSheet_(book, SHEETS.categories, CATEGORY_COLUMNS)
  if (categorySheet.getLastRow() === 1) {
    const rows = DEFAULT_CATEGORIES.map(([kind, name, icon, options = {}], index) => [
      kind,
      name,
      index + 1,
      options.excluded === true,
      options.fixed === true,
      icon,
      options.personal === true,
    ])
    categorySheet.getRange(2, 1, rows.length, CATEGORY_COLUMNS.length).setValues(rows)
  }
  addMissingCategoryColumns_(categorySheet)
  addMissingTransactionColumns_(book.getSheetByName(SHEETS.transactions))

  const settingSheet = ensureSheet_(book, SHEETS.settings, SETTING_COLUMNS, ['수정시각'])
  if (settingSheet.getLastRow() === 1) {
    const now = new Date().toISOString()
    settingSheet.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS.map(([key, value]) => [key, value, now]))
  }

  if (typeof API_TOKEN !== 'undefined') return
  const properties = PropertiesService.getScriptProperties()
  if (!properties.getProperty('TOKEN')) properties.setProperty('TOKEN', Utilities.getUuid())
  Logger.log('앱 설정에 입력할 토큰: %s', properties.getProperty('TOKEN'))
}

// 연도 탭(2025, 2026 …)의 월 합계를 거래내역으로 옮긴다.
// resync가 true면 이미 옮긴 행도 연도 탭 값에 맞춰 금액을 고치고, 비워진 칸은 삭제 처리한다.
function migrateFromYearTabs(resync = false) {
  const book = SpreadsheetApp.getActive()
  const sheet = book.getSheetByName(SHEETS.transactions)
  if (!sheet) throw new Error('먼저 setup을 실행하세요.')
  const existing = new Map(readObjects_(sheet).filter(row => String(row.id).startsWith('legacy-')).map(row => [String(row.id), fromRow_(row)]))
  const kindByCategory = readCategoryKinds_(book)
  const now = new Date().toISOString()
  const added = []
  const changed = []
  const seenIds = new Set()

  book.getSheets().forEach(yearSheet => {
    const year = Number(yearSheet.getName())
    if (!Number.isInteger(year)) return
    const values = yearSheet.getDataRange().getValues()
    const header = values[0]

    values.slice(1).forEach(row => {
      const legacyName = String(row[0]).trim()
      const category = LEGACY_CATEGORY_ALIASES[legacyName] || legacyName
      const kind = kindByCategory[category]
      if (!kind) return

      header.forEach((label, column) => {
        const match = String(label).match(/^(\d{1,2})월([AB])$/)
        const amount = Math.round(Number(row[column]))
        if (!match || !amount) return
        const month = Number(match[1])
        const id = `legacy-${year}-${month}-${match[2]}-${category}`
        seenIds.add(id)
        const current = existing.get(id)
        if (current) {
          if (resync && (current.amount !== amount || current.deleted)) {
            changed.push({ ...current, amount, deleted: false, updatedAt: now, memo: `${current.memo} · ${current.amount}→${amount}` })
          }
          return
        }
        added.push({
          id,
          occurredAt: new Date(year, month - 1, 1, 12).toISOString(),
          person: match[2] === 'A' ? '쿠리만쥬' : '우사기',
          kind,
          amount,
          shareCount: 1,
          merchant: '월 합계',
          category,
          excluded: false,
          source: '이관',
          memo: `${yearSheet.getName()} 탭에서 이관`,
          rawText: '',
          deleted: false,
          updatedAt: now,
          scope: '공동',
        })
      })
    })
  })

  if (resync) {
    existing.forEach((current, id) => {
      if (!seenIds.has(id) && !current.deleted) changed.push({ ...current, deleted: true, updatedAt: now })
    })
  }

  upsert_(sheet, 'id', [...added, ...changed].map(item => toRow_(item, now)))
  const result = { added: added.length, changed: changed.map(item => ({ id: item.id, amount: item.amount, deleted: item.deleted })) }
  Logger.log('이관 결과: %s', JSON.stringify(result))
  return result
}

function doGet(e) {
  return handle_(() => {
    authorize_(e.parameter.token)
    if (e.parameter.action !== 'pull') throw new Error('알 수 없는 요청이에요.')
    return pull_(e.parameter.since || '')
  })
}

function doPost(e) {
  return handle_(() => {
    const body = JSON.parse(e.postData.contents)
    authorize_(body.token)
    if (body.action === 'push') return push_(body)
    if (body.action === 'capture') return capture_(body)
    if (body.action === 'setup') {
      setup()
      return { migrated: body.migrate ? migrateFromYearTabs(body.migrate === 'resync') : null }
    }
    throw new Error('알 수 없는 요청이에요.')
  })
}

// 처음 배포 때 만든 카테고리 탭에는 고정비·아이콘 열이 없어서, 이름으로 기본값을 채워 넣는다.
function addMissingCategoryColumns_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  const defaults = Object.fromEntries(
    DEFAULT_CATEGORIES.map(([, name, icon, options = {}]) => [name, { 고정비: options.fixed === true, 아이콘: icon, 개인지출: options.personal === true }]),
  )
  const names = sheet.getLastRow() > 1 ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().map(row => String(row[0])) : []

  ;['고정비', '아이콘', '개인지출'].forEach(column => {
    if (header.includes(column)) return
    const columnIndex = sheet.getLastColumn() + 1
    sheet.getRange(1, columnIndex).setValue(column).setFontWeight('bold')
    if (names.length === 0) return
    const values = names.map(name => [defaults[name] ? defaults[name][column] : column === '아이콘' ? '' : false])
    sheet.getRange(2, columnIndex, values.length, 1).setValues(values)
  })
}

// 공동개인 열이 없던 시절의 거래내역 탭에는 머리글만 붙인다. 빈 칸은 공동으로 읽는다.
function addMissingTransactionColumns_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  TRANSACTION_COLUMNS.forEach((column, index) => {
    if (header[index] === column) return
    if (header.includes(column)) throw new Error(`거래내역 탭의 ${column} 열 위치가 예상과 달라요.`)
    sheet.getRange(1, index + 1).setValue(column).setFontWeight('bold')
  })
}

function pull_(since) {
  const book = SpreadsheetApp.getActive()
  const isNewer = row => !since || toIso_(row['동기화시각']) > since
  return {
    serverTime: new Date().toISOString(),
    transactions: readObjects_(book.getSheetByName(SHEETS.transactions)).filter(isNewer).map(fromRow_),
    rules: readObjects_(book.getSheetByName(SHEETS.rules))
      .filter(isNewer)
      .map(row => ({ keyword: String(row['키워드']), category: String(row['카테고리']), updatedAt: String(row['수정시각']) })),
    categories: readObjects_(book.getSheetByName(SHEETS.categories)).map(row => ({
      kind: String(row['구분']),
      name: String(row['이름']),
      order: Number(row['순서']),
      excluded: row['통계제외'] === true,
      fixed: row['고정비'] === true,
      icon: String(row['아이콘'] || ''),
      personal: row['개인지출'] === true,
    })),
    settings: Object.fromEntries(readObjects_(book.getSheetByName(SHEETS.settings)).map(row => [String(row['키']), toSettingValue_(row['값'])])),
    captures: book.getSheetByName(SHEETS.captures)
      ? readObjects_(book.getSheetByName(SHEETS.captures))
          .filter(isNewer)
          .map(row => ({
            key: String(row['키']),
            receivedAt: toIso_(row['받은시각']),
            person: String(row['사람'] || ''),
            text: String(row['내용']),
            status: String(row['상태']),
          }))
      : [],
  }
}

function captureSheet_(book) {
  return ensureSheet_(book, SHEETS.captures, CAPTURE_COLUMNS, ['키', '받은시각', '내용', '동기화시각'])
}

function capture_(body) {
  const text = String(body.text || '').trim()
  if (!text) throw new Error('보낼 내용이 없어요.')
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const now = new Date().toISOString()
    const key = Utilities.getUuid()
    captureSheet_(SpreadsheetApp.getActive()).appendRow([key, now, String(body.person || ''), text, '대기', now])
    return { key }
  } finally {
    lock.releaseLock()
  }
}

// 다른 기기에도 처리 결과가 보이도록 상태만 바꾸고 동기화시각을 새로 찍는다.
function updateCaptureStatuses_(book, captures, now) {
  const updates = captures.filter(item => CAPTURE_STATUSES.includes(item.status))
  if (updates.length === 0) return
  const sheet = captureSheet_(book)
  const values = sheet.getDataRange().getValues()
  const rowByKey = new Map(values.slice(1).map((row, index) => [String(row[0]), index + 2]))
  const statusColumn = CAPTURE_COLUMNS.indexOf('상태') + 1
  updates.forEach(item => {
    const row = rowByKey.get(String(item.key))
    if (row) sheet.getRange(row, statusColumn, 1, 2).setValues([[item.status, now]])
  })
}

// 예산 같은 숫자 설정과 닉네임 같은 글자 설정을 함께 저장한다.
function toSettingValue_(value) {
  if (typeof value === 'number') return value
  const text = String(value ?? '')
  return text.trim() !== '' && !isNaN(Number(text)) ? Number(text) : text
}

function push_(body) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const book = SpreadsheetApp.getActive()
    const now = new Date().toISOString()
    upsert_(book.getSheetByName(SHEETS.transactions), 'id', (body.transactions || []).map(item => toRow_(item, now)))
    upsert_(
      book.getSheetByName(SHEETS.rules),
      '키워드',
      (body.rules || []).map(rule => [rule.keyword, rule.category, rule.updatedAt, now]),
    )
    updateCategories_(book.getSheetByName(SHEETS.categories), body.categories || [])
    upsert_(
      book.getSheetByName(SHEETS.settings),
      '키',
      Object.entries(body.settings || {}).map(([key, value]) => [key, toSettingValue_(value), now]),
    )
    updateCaptureStatuses_(book, body.captures || [], now)
    return { serverTime: now }
  } finally {
    lock.releaseLock()
  }
}

const CATEGORY_FIELDS = { personal: '개인지출', fixed: '고정비', excluded: '통계제외', icon: '아이콘' }

// 이름으로 찾은 카테고리 행에서 넘겨받은 칸만 바꾼다.
function updateCategories_(sheet, updates) {
  if (updates.length === 0) return
  const values = sheet.getDataRange().getValues()
  const header = values[0]
  const rowByName = new Map(values.slice(1).map((row, index) => [String(row[header.indexOf('이름')]), index + 2]))

  updates.forEach(update => {
    const row = rowByName.get(update.name)
    if (!row) throw new Error(`카테고리를 찾을 수 없어요: ${update.name}`)
    Object.entries(CATEGORY_FIELDS).forEach(([field, column]) => {
      if (update[field] === undefined) return
      sheet.getRange(row, header.indexOf(column) + 1).setValue(update[field])
    })
  })
}

function upsert_(sheet, keyColumn, rows) {
  if (rows.length === 0) return
  const values = sheet.getDataRange().getValues()
  const keyIndex = values[0].indexOf(keyColumn)
  const rowByKey = new Map(values.slice(1).map((row, index) => [String(row[keyIndex]), index + 2]))
  const appended = []

  rows.forEach(row => {
    const existingRow = rowByKey.get(String(row[keyIndex]))
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row])
      return
    }
    appended.push(row)
    rowByKey.set(String(row[keyIndex]), -1)
  })

  if (appended.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, appended[0].length).setValues(appended)
}

function toRow_(item, syncedAt) {
  return [
    item.id,
    item.occurredAt,
    item.person,
    item.kind,
    item.amount,
    item.shareCount || 1,
    item.merchant || '',
    item.category || '',
    item.excluded === true,
    item.source || '',
    item.memo || '',
    item.rawText || '',
    item.deleted === true,
    item.updatedAt,
    syncedAt,
    item.scope === '개인' ? '개인' : '공동',
  ]
}

function fromRow_(row) {
  return {
    id: String(row['id']),
    occurredAt: toIso_(row['일시']),
    person: String(row['사람']),
    kind: String(row['구분']),
    amount: Number(row['금액']),
    shareCount: Number(row['인원']) || 1,
    merchant: String(row['가맹점']),
    category: String(row['카테고리']),
    excluded: row['통계제외'] === true,
    source: String(row['출처']),
    memo: String(row['메모']),
    rawText: String(row['원문']),
    deleted: row['삭제'] === true,
    updatedAt: toIso_(row['수정시각']),
    scope: row['공동개인'] === '개인' ? '개인' : '공동',
  }
}

function toIso_(value) {
  return value instanceof Date ? value.toISOString() : String(value)
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues()
  const header = values[0]
  return values.slice(1).map(row => Object.fromEntries(header.map((name, index) => [name, row[index]])))
}

function readCategoryKinds_(book) {
  return Object.fromEntries(readObjects_(book.getSheetByName(SHEETS.categories)).map(row => [row['이름'], row['구분']]))
}

// ISO 시각 문자열을 시트가 날짜로 바꾸지 않도록 텍스트 서식을 건다.
function ensureSheet_(book, name, columns, textColumns = []) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name)
  if (sheet.getLastRow() > 0) return sheet
  sheet.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold')
  sheet.setFrozenRows(1)
  textColumns.forEach(column => {
    sheet.getRange(1, columns.indexOf(column) + 1, sheet.getMaxRows(), 1).setNumberFormat('@')
  })
  return sheet
}

// API_TOKEN은 clasp로 함께 올리는 Secret.gs에 있다. 없으면 setup이 만든 스크립트 속성을 쓴다.
function authorize_(token) {
  const expected = typeof API_TOKEN !== 'undefined' ? API_TOKEN : PropertiesService.getScriptProperties().getProperty('TOKEN')
  if (!expected || token !== expected) throw new Error('토큰이 올바르지 않아요.')
}

function handle_(work) {
  let result
  try {
    result = { ok: true, ...work() }
  } catch (error) {
    result = { ok: false, error: String(error.message || error) }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)
}
