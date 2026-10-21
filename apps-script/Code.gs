const SHEETS = {
  transactions: '거래내역',
  categories: '카테고리',
  rules: '분류규칙',
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
]

const CATEGORY_COLUMNS = ['구분', '이름', '순서', '통계제외']
const RULE_COLUMNS = ['키워드', '카테고리', '수정시각', '동기화시각']

const DEFAULT_CATEGORIES = [
  ['지출', '편의점·마트·잡화'],
  ['지출', '여행·숙박'],
  ['지출', '쇼핑'],
  ['지출', '식비'],
  ['지출', '교통·자동차'],
  ['지출', '주거·통신'],
  ['지출', '보험·세금·기타금융'],
  ['지출', '의료·건강·피트니스'],
  ['지출', '취미·여가'],
  ['지출', '카페·간식'],
  ['지출', '술·유흥'],
  ['지출', '미용'],
  ['지출', '생활'],
  ['지출', '원두'],
  ['지출', '과자'],
  ['지출', '모임계'],
  ['지출', '부모님용돈'],
  ['지출', '선물'],
  ['지출', '교육'],
  ['지출', '축의금'],
  ['지출', '카드대금'],
  ['지출', '카테고리 없음'],
  ['수입', '월급'],
  ['수입', '은행이자지원'],
  ['수입', '연말정산'],
  ['수입', '보험금환급'],
  ['수입', '상여(출장포함)'],
  ['수입', '배당금'],
  ['수입', 'K패스환급'],
  ['수입', '인터넷환급'],
  ['수입', '정산', true],
  ['저축', '저축·투자'],
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
    const rows = DEFAULT_CATEGORIES.map(([kind, name, excluded], index) => [kind, name, index + 1, excluded === true])
    categorySheet.getRange(2, 1, rows.length, CATEGORY_COLUMNS.length).setValues(rows)
  }

  if (typeof API_TOKEN !== 'undefined') return
  const properties = PropertiesService.getScriptProperties()
  if (!properties.getProperty('TOKEN')) properties.setProperty('TOKEN', Utilities.getUuid())
  Logger.log('앱 설정에 입력할 토큰: %s', properties.getProperty('TOKEN'))
}

function migrateFromYearTabs() {
  const book = SpreadsheetApp.getActive()
  const sheet = book.getSheetByName(SHEETS.transactions)
  if (!sheet) throw new Error('먼저 setup을 실행하세요.')
  const existingIds = new Set(readObjects_(sheet).map(row => row.id))
  const kindByCategory = readCategoryKinds_(book)
  const now = new Date().toISOString()
  const rows = []

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
        const person = match[2] === 'A' ? '쿠리만쥬' : '우사기'
        const id = `legacy-${year}-${month}-${match[2]}-${category}`
        if (existingIds.has(id)) return
        const occurredAt = new Date(year, month - 1, 1, 12).toISOString()
        rows.push(toRow_({
          id,
          occurredAt,
          person,
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
        }, now))
      })
    })
  })

  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, TRANSACTION_COLUMNS.length).setValues(rows)
  Logger.log('이관한 행: %s', rows.length)
  return rows.length
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
    if (body.action === 'setup') {
      setup()
      return { migrated: body.migrate === true ? migrateFromYearTabs() : 0 }
    }
    throw new Error('알 수 없는 요청이에요.')
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
    })),
  }
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
    return { serverTime: now }
  } finally {
    lock.releaseLock()
  }
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
