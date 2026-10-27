// 새 일정이 생기면 상대방 기기로 FCM 푸시를 보낸다. 기기 토큰은 스크립트 속성에 모아 둔다.
const PUSH_TOKENS_KEY = 'PUSH_TOKENS'
const PUSH_PEOPLE = ['쿠리만쥬', '우사기']
const PUSH_PLATFORMS = ['android', 'web']
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const PUSH_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 편집기에서 한 번 실행해 외부 요청(FCM) 권한을 허용한다.
function authorizePush() {
  UrlFetchApp.fetch('https://fcm.googleapis.com/', { muteHttpExceptions: true })
}

function registerPushToken_(body) {
  const token = String(body.pushToken || '')
  if (!token) throw new Error('알림 토큰이 없어요.')
  if (!PUSH_PEOPLE.includes(body.person)) throw new Error('알 수 없는 사람이에요.')
  if (!PUSH_PLATFORMS.includes(body.platform)) throw new Error('알 수 없는 기기예요.')
  const tokens = readPushTokens_()
  tokens[token] = { person: body.person, platform: body.platform, updatedAt: new Date().toISOString() }
  writePushTokens_(tokens)
  return {}
}

function unregisterPushToken_(body) {
  const tokens = readPushTokens_()
  delete tokens[String(body.pushToken || '')]
  writePushTokens_(tokens)
  return {}
}

function readPushTokens_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty(PUSH_TOKENS_KEY) || '{}')
}

function writePushTokens_(tokens) {
  PropertiesService.getScriptProperties().setProperty(PUSH_TOKENS_KEY, JSON.stringify(tokens))
}

// 알림이 실패해도 일정 저장은 성공으로 돌려준다.
function notifyCalendarAdded_(actor, event) {
  try {
    if (!actor || !PUSH_PEOPLE.includes(actor.person) || !event || !event.title) return
    const title = `${actor.name || actor.person}님이 '${event.title}' 일정을 추가했어요`
    sendPushToOthers_(actor.person, { title, body: formatPushDate_(event.start), date: dateKeyOf_(event.start) })
  } catch (error) {
    console.error('알림을 보내지 못했어요', error)
  }
}

function sendPushToOthers_(actorPerson, message) {
  if (typeof FIREBASE_SERVICE_ACCOUNT === 'undefined') return
  const tokens = readPushTokens_()
  const targets = Object.keys(tokens).filter(token => tokens[token].person !== actorPerson)
  if (targets.length === 0) return

  const accessToken = fcmAccessToken_()
  const url = `https://fcm.googleapis.com/v1/projects/${FIREBASE_SERVICE_ACCOUNT.project_id}/messages:send`
  const requests = targets.map(token => ({
    url,
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${accessToken}` },
    payload: JSON.stringify({ message: toFcmMessage_(token, tokens[token].platform, message) }),
    muteHttpExceptions: true,
  }))
  const responses = UrlFetchApp.fetchAll(requests)

  // 앱을 지웠거나 알림을 끈 기기의 토큰은 정리한다.
  let isChanged = false
  responses.forEach((response, index) => {
    const code = response.getResponseCode()
    if (code === 404 || (code === 400 && response.getContentText().includes('registration token'))) {
      delete tokens[targets[index]]
      isChanged = true
    }
  })
  if (isChanged) writePushTokens_(tokens)
}

function toFcmMessage_(token, platform, message) {
  const data = { date: message.date || '' }
  if (platform === 'android') {
    return { token, notification: { title: message.title, body: message.body }, data, android: { priority: 'high' } }
  }
  // 웹(아이폰 홈 화면 앱)은 서비스 워커가 data를 받아 직접 알림을 띄운다.
  return { token, data: { ...data, title: message.title, body: message.body }, webpush: { headers: { Urgency: 'high' } } }
}

function formatPushDate_(value) {
  const dateKey = dateKeyOf_(value)
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = PUSH_WEEKDAYS[new Date(year, month - 1, day).getDay()]
  return `${month}월 ${day}일 (${weekday})`
}

function fcmAccessToken_() {
  const cache = CacheService.getScriptCache()
  const cached = cache.get('FCM_ACCESS_TOKEN')
  if (cached) return cached

  const account = FIREBASE_SERVICE_ACCOUNT
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Utilities.base64EncodeWebSafe(JSON.stringify(value)).replace(/=+$/, '')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: FCM_SCOPE, aud: account.token_uri, iat: now, exp: now + 3600 })}`
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(unsigned, account.private_key)).replace(/=+$/, '')
  const response = UrlFetchApp.fetch(account.token_uri, {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` },
  })
  const accessToken = JSON.parse(response.getContentText()).access_token
  cache.put('FCM_ACCESS_TOKEN', accessToken, 50 * 60)
  return accessToken
}
