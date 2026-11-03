// 영수증 사진을 Gemini로 읽어 품목별 금액과 카테고리를 돌려준다. 키는 Secret.gs의 GEMINI_API_KEY.
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta'
// 가장 새 모델은 응답이 몇 분씩 걸리기도 해서, 영수증 한 장을 몇 초 안에 읽는 모델을 순서대로 쓴다.
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest']

function analyzeReceipt_(body) {
  if (typeof GEMINI_API_KEY === 'undefined') throw new Error('영수증 분석 키가 설정되지 않았어요.')
  const image = String(body.image || '')
  if (!image) throw new Error('영수증 사진이 없어요.')
  const categories = (body.categories || []).map(String).filter(Boolean)
  if (categories.length === 0) throw new Error('카테고리 목록이 없어요.')

  const model = geminiModel_()
  const request = thinking =>
    UrlFetchApp.fetch(`${GEMINI_API}/models/${model}:generateContent`, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: body.mimeType || 'image/jpeg', data: image } }, { text: receiptPrompt_(categories) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: receiptSchema_(categories), ...thinking },
      }),
    })
  // 기본값으로 두면 오래 생각하느라 느려져서, 생각을 줄인다. 모델이 그 설정을 모르면 설정 없이 한 번 더 보낸다.
  let response = request({ thinkingConfig: { thinkingLevel: 'low' } })
  if (response.getResponseCode() === 400) response = request({})
  if (response.getResponseCode() !== 200) throw new Error(`영수증을 읽지 못했어요. (${geminiErrorOf_(response)})`)

  const result = JSON.parse(response.getContentText())
  const text = result.candidates && result.candidates[0] && result.candidates[0].content.parts.map(part => part.text || '').join('')
  if (!text) throw new Error('영수증에서 품목을 찾지 못했어요.')
  const receipt = JSON.parse(text)
  const items = (receipt.items || [])
    .map(item => ({ name: String(item.name || '').trim(), amount: Math.round(Number(item.amount) || 0), category: String(item.category || '') }))
    .filter(item => item.name && item.amount !== 0)
    .map(item => (categories.includes(item.category) ? item : { ...item, category: categories[0] }))
  if (items.length === 0) throw new Error('영수증에서 품목을 찾지 못했어요.')
  return { receipt: { merchant: String(receipt.merchant || '').trim(), total: Math.round(Number(receipt.total) || 0), items } }
}

// 실행 기록에서는 웹 앱 로그를 볼 수 없어서, 앱 화면에 이유를 짧게 보여준다. 키는 응답에 들어 있지 않다.
function geminiErrorOf_(response) {
  const code = response.getResponseCode()
  try {
    const error = JSON.parse(response.getContentText()).error || {}
    return `${code} ${error.status || ''} ${String(error.message || '').slice(0, 160)}`.trim()
  } catch (parseError) {
    return String(code)
  }
}

function receiptPrompt_(categories) {
  return [
    '한국 영수증 사진이에요. 산 품목마다 이름과 실제로 낸 금액(원, 정수)을 뽑고, 아래 카테고리 중 하나로 분류해 주세요.',
    `카테고리: ${categories.join(', ')}`,
    '- 식재료: 집에서 요리하거나 데워 먹는 재료 (채소, 과일, 고기, 생선, 우유, 계란, 쌀, 양념, 라면, 즉석밥, 냉동식품)',
    '- 외식: 사서 바로 먹는 먹거리 (삼각김밥, 도시락, 샌드위치, 음료, 즉석식품)',
    '- 생활: 휴지, 세제, 위생용품, 주방·욕실 소모품 같은 생활용품',
    '- 위 셋에 안 맞으면 목록의 다른 카테고리, 그래도 애매하면 편의점·마트·잡화',
    '할인 줄은 따로 품목으로 만들지 말고 해당 품목 금액에서 빼 주세요. 어느 품목 할인인지 모르면 가장 비싼 품목에서 빼요.',
    'merchant는 가게 이름, total은 카드로 실제 결제한 합계예요. 품목 이름은 영수증에 적힌 그대로 짧게 써 주세요.',
  ].join('\n')
}

function receiptSchema_(categories) {
  return {
    type: 'OBJECT',
    properties: {
      merchant: { type: 'STRING' },
      total: { type: 'INTEGER' },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { name: { type: 'STRING' }, amount: { type: 'INTEGER' }, category: { type: 'STRING', enum: categories } },
          required: ['name', 'amount', 'category'],
        },
      },
    },
    required: ['merchant', 'total', 'items'],
  }
}

// 쓸 수 있는 모델 목록에서 GEMINI_MODELS 순서대로 첫 번째를 골라 하루 동안 기억한다.
function geminiModel_() {
  const cache = CacheService.getScriptCache()
  const cached = cache.get('GEMINI_RECEIPT_MODEL')
  if (cached) return cached
  const response = UrlFetchApp.fetch(`${GEMINI_API}/models?pageSize=200`, { headers: { 'x-goog-api-key': GEMINI_API_KEY }, muteHttpExceptions: true })
  if (response.getResponseCode() !== 200) return GEMINI_MODELS[0]
  const available = (JSON.parse(response.getContentText()).models || []).map(model => String(model.name).replace(/^models\//, ''))
  const model = GEMINI_MODELS.find(name => available.includes(name)) || GEMINI_MODELS[0]
  cache.put('GEMINI_RECEIPT_MODEL', model, 24 * 60 * 60)
  return model
}

// 편집기에서 실행해 키가 동작하는지, 어떤 모델을 쓰는지 확인한다.
function checkGemini() {
  CacheService.getScriptCache().remove('GEMINI_RECEIPT_MODEL')
  Logger.log('사용할 모델: %s', geminiModel_())
}
