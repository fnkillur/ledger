// 아이폰 홈 화면 앱용 푸시 서비스 워커. 서버가 data로 보낸 제목·내용을 직접 알림으로 띄운다.
// 알림을 눌렀을 때 열린 창을 옮길 수 있도록 바로 페이지를 맡는다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {}
  const data = payload.data || {}
  event.waitUntil(
    self.registration.showNotification(data.title || '새 일정', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { date: data.date || '' },
    }),
  )
})

// 알림을 누르면 앱을 열고 그 날짜로 간다. 이미 열려 있으면 그 창을 앞으로 가져온다.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const date = event.notification.data && event.notification.data.date
  const url = new URL(date ? `./#/?date=${date}` : './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const opened = windows[0]
      if (!opened) return self.clients.openWindow(url)
      return opened.focus().then(client => client.navigate(url))
    }),
  )
})
