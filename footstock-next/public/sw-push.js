// Service Worker — Foot Stock Web Push
// module-19-inbox-notificacoes

self.addEventListener('push', function (event) {
  var data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Foot Stock', body: 'Nova notificação' }
  }

  var title = data.title || 'Foot Stock'
  var options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'foot-stock-notification',
    data: data,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  var url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i]
          if (client.url === url && 'focus' in client) {
            return client.focus()
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )
})
