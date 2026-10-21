export type OcrProgress = { stage: '준비' | '인식'; ratio: number }

// 이미지는 폰 안에서만 처리된다. 인식 엔진과 한글 데이터만 처음 한 번 CDN에서 받아 브라우저에 캐시한다.
export const recognizeImages = async (files: File[], onProgress: (progress: OcrProgress) => void) => {
  const { createWorker } = await import('tesseract.js')
  let current = 0

  const worker = await createWorker('kor', 1, {
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
      const { data } = await worker.recognize(file)
      texts.push(data.text)
    }
    return texts.join('\n')
  } finally {
    await worker.terminate()
  }
}
