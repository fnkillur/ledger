export type OcrProgress = { stage: '준비' | '인식'; ratio: number }

type RecognizeOptions = {
  languages?: string[]
  // 알림톡처럼 장식 배경 위 말풍선은 글자만 검게 남겨야 영문 가맹점·금액을 덜 틀린다.
  binarize?: boolean
}

const BINARIZE_THRESHOLD = 120

const toBinarized = async (file: File) => {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]
    const value = luminance < BINARIZE_THRESHOLD ? 0 : 255
    pixels[index] = value
    pixels[index + 1] = value
    pixels[index + 2] = value
  }
  context.putImageData(image, 0, 0)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('이미지를 처리하지 못했어요'))), 'image/png'))
}

// 이미지는 폰 안에서만 처리된다. 인식 엔진과 언어 데이터만 처음 한 번 CDN에서 받아 브라우저에 캐시한다.
export const recognizeImages = async (files: File[], onProgress: (progress: OcrProgress) => void, options: RecognizeOptions = {}) => {
  const { languages = ['kor'], binarize = false } = options
  const { createWorker } = await import('tesseract.js')
  let current = 0

  const worker = await createWorker(languages, 1, {
    logger: message => {
      if (message.status === 'recognizing text') {
        onProgress({ stage: '인식', ratio: (current + message.progress) / files.length })
        return
      }
      onProgress({ stage: '준비', ratio: message.progress ?? 0 })
    },
  })

  try {
    const texts: string[] = []
    for (const [index, file] of files.entries()) {
      current = index
      const { data } = await worker.recognize(binarize ? await toBinarized(file) : file)
      texts.push(data.text)
    }
    return texts.join('\n')
  } finally {
    await worker.terminate()
  }
}
