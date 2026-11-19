// 영수증 사진을 Gemini로 읽어 품목별 금액과 카테고리를 돌려준다. 키는 Secret.gs의 GEMINI_API_KEY.
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta'
// flash 모델은 몰리면 몇 분씩 걸리거나 503으로 거절해서, 몇 초 안에 읽는 lite 모델부터 쓴다.
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash']
// 모델이 붐비거나 한도를 넘겼다는 응답이라, 다음 모델로 넘어가 본다.
const GEMINI_RETRYABLE_CODES = [429, 500, 503, 504]

function analyzeReceipt_(body) {
  if (typeof GEMINI_API_KEY === 'undefined') throw new Error('영수증 분석 키가 설정되지 않았어요.')
  const image = String(body.image || '')
  if (!image) throw new Error('영수증 사진이 없어요.')
  const categories = (body.categories || []).map(String).filter(Boolean)
  if (categories.length === 0) throw new Error('카테고리 목록이 없어요.')

  const request = (model, thinking) =>
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
  const requestModel = model => {
    const response = request(model, { thinkingConfig: { thinkingLevel: 'low' } })
    return response.getResponseCode() === 400 ? request(model, {}) : response
  }
  let response
  for (const model of geminiModels_()) {
    response = requestModel(model)
    if (!GEMINI_RETRYABLE_CODES.includes(response.getResponseCode())) break
  }
  if (response.getResponseCode() !== 200) throw new Error(`영수증을 읽지 못했어요. (${geminiErrorOf_(response)})`)

  const result = JSON.parse(response.getContentText())
  const text = result.candidates && result.candidates[0] && result.candidates[0].content.parts.map(part => part.text || '').join('')
  if (!text) throw new Error('영수증에서 품목을 찾지 못했어요.')
  const receipt = JSON.parse(text)
  const items = (receipt.items || [])
    .map(item => ({
      name: String(item.name || '').trim(),
      amount: Math.round(Number(item.amount) || 0),
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      category: String(item.category || ''),
    }))
    .filter(item => item.name && item.amount !== 0)
    .map(item => (categories.includes(item.category) ? item : { ...item, category: categories[0] }))
  if (items.length === 0) throw new Error('영수증에서 품목을 찾지 못했어요.')
  return { receipt: { merchant: String(receipt.merchant || '').trim(), total: Math.round(Number(receipt.total) || 0), paidAt: String(receipt.paidAt || '').trim(), items } }
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
    'quantity는 그 줄의 수량(개수)이에요. 수량이 안 적혀 있거나 무게로 판 품목이면 1로 둬요. amount는 수량만큼 산 그 줄의 금액이에요.',
    'merchant는 가게 이름, total은 카드로 실제 결제한 합계예요. 품목 이름은 영수증에 적힌 그대로 짧게 써 주세요.',
    'paidAt은 영수증에 찍힌 결제 일시를 YYYY-MM-DDTHH:mm(24시간)으로, 시각이 없으면 YYYY-MM-DD로 써 주세요. 날짜가 안 보이면 빈 문자열로 둬요.',
  ].join('\n')
}

function receiptSchema_(categories) {
  return {
    type: 'OBJECT',
    properties: {
      merchant: { type: 'STRING' },
      total: { type: 'INTEGER' },
      paidAt: { type: 'STRING' },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { name: { type: 'STRING' }, amount: { type: 'INTEGER' }, quantity: { type: 'INTEGER' }, category: { type: 'STRING', enum: categories } },
          required: ['name', 'amount', 'quantity', 'category'],
        },
      },
    },
    required: ['merchant', 'total', 'items'],
  }
}

// GEMINI_MODELS 중 이 키로 쓸 수 있는 모델만 순서대로 골라 하루 동안 기억한다.
function geminiModels_() {
  const cache = CacheService.getScriptCache()
  const cached = cache.get('GEMINI_RECEIPT_MODELS')
  if (cached) return JSON.parse(cached)
  const response = UrlFetchApp.fetch(`${GEMINI_API}/models?pageSize=200`, { headers: { 'x-goog-api-key': GEMINI_API_KEY }, muteHttpExceptions: true })
  if (response.getResponseCode() !== 200) return GEMINI_MODELS
  const available = (JSON.parse(response.getContentText()).models || []).map(model => String(model.name).replace(/^models\//, ''))
  const models = GEMINI_MODELS.filter(name => available.includes(name))
  if (models.length === 0) return GEMINI_MODELS
  cache.put('GEMINI_RECEIPT_MODELS', JSON.stringify(models), 24 * 60 * 60)
  return models
}

// 편집기에서 실행해 키가 동작하는지, 어떤 모델을 어떤 순서로 쓰는지 확인한다.
function checkGemini() {
  CacheService.getScriptCache().remove('GEMINI_RECEIPT_MODELS')
  Logger.log('사용할 모델: %s', geminiModels_().join(' → '))
}
