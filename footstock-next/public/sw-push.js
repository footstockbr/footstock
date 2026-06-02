// Service Worker — FootStock Web Push
// module-19-inbox-notificacoes
// EVT-046 e EVT-047: postMessage para client window (AnalyticsProvider escuta)

self.addEventListener('push', function (event) {
  var data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'FootStock', body: 'Nova notificação' }
  }

  var title = data.title || 'FootStock'
  var options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'foot-stock-notification',
    data: Object.assign({}, data, { receivedAt: Date.now() }),
  }

  var showAndBadge = self.registration.showNotification(title, options).then(function () {
    // Atualizar app badge com contagem de notificacoes nao lidas (best-effort)
    var badgeCount = data.badgeCount
    if (typeof badgeCount === 'number' && 'setAppBadge' in navigator) {
      navigator.setAppBadge(badgeCount).catch(function () {})
    }

    // EVT-046: push_notification_received — postMessage para client window
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        clientList[i].postMessage({
          type: 'ANALYTICS_PUSH_RECEIVED',
          notification_type: data.notification_type || 'ADMIN_BROADCAST',
          receivedAt: Date.now(),
        })
      }
    }).catch(function () {})
  })

  event.waitUntil(showAndBadge)
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  var url = (event.notification.data && event.notification.data.url) || '/'
  var notifData = event.notification.data || {}

  // EVT-047: push_notification_clicked — postMessage para client window
  var receivedAt = notifData.receivedAt || Date.now()
  var timeToClick = Math.round((Date.now() - receivedAt) / 1000)

  clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    for (var i = 0; i < clientList.length; i++) {
      clientList[i].postMessage({
        type: 'ANALYTICS_PUSH_CLICKED',
        notification_type: notifData.notification_type || 'ADMIN_BROADCAST',
        time_to_click_seconds: timeToClick,
      })
    }
  }).catch(function () {})

  // Limpar badge ao clicar na notificacao
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(function () {})
  }

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
