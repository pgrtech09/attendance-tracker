// ==========================================================================
// Service Worker — Smart College Attendance Tracker
// Strategy: cache-first app shell, network-first for everything else
// (Supabase API calls are never cached — they always hit the network so
// data stays correct; if offline, the app's own IndexedDB/localStorage
// queue in assets/js/app.js takes over and this worker just replays it
// once connectivity returns via Background Sync).
// ==========================================================================

const CACHE_VERSION = 'v1';
const CACHE_NAME = `attendance-tracker-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './register.html',
  './dashboard.html',
  './attendance.html',
  './calendar.html',
  './profile.html',
  './settings.html',
  './reports.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/supabase-client.js',
  './assets/js/reference-data.js',
  './assets/js/attendance-calc.js',
  './assets/js/dashboard.js',
  './assets/js/attendance.js',
  './assets/js/calendar.js',
  './assets/js/profile.js',
  './assets/js/settings.js',
  './assets/js/reports.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache Supabase / API traffic — always go to network.
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
    return;
  }

  // Navigation requests: network-first, fall back to cached shell offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Static assets: cache-first, update cache in background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// ---------------- Background Sync: replay queued attendance writes ----------------
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' }));
}

// ---------------- Local reminder notifications ----------------
let reminderTimes = null;
let reminderInterval = null;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_REMINDERS') {
    reminderTimes = { morning: event.data.morning, evening: event.data.evening };
    startReminderClock();
  }
});

function startReminderClock() {
  if (reminderInterval) clearInterval(reminderInterval);
  const firedToday = new Set();
  reminderInterval = setInterval(() => {
    if (!reminderTimes) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayKey = now.toISOString().slice(0, 10);

    if (hhmm === reminderTimes.morning && !firedToday.has('morning-' + dayKey)) {
      firedToday.add('morning-' + dayKey);
      self.registration.showNotification('Mark your attendance', {
        body: "Good morning! Don't forget to mark today's classes as they happen.",
        icon: './assets/icons/icon-192.png',
        badge: './assets/icons/icon-192.png'
      });
    }
    if (hhmm === reminderTimes.evening && !firedToday.has('evening-' + dayKey)) {
      firedToday.add('evening-' + dayKey);
      self.registration.showNotification('Attendance reminder', {
        body: 'End of day — make sure every class today has been marked.',
        icon: './assets/icons/icon-192.png',
        badge: './assets/icons/icon-192.png'
      });
    }
  }, 30000); // check twice a minute
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('attendance.html') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./attendance.html');
    })
  );
});
