import { supabase } from './supabase-client.js';
import { logout, requireSession } from './auth.js';

const THEME_KEY = 'sat_theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', saved);
  document.body.setAttribute('data-theme', saved);
}

export function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.body.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  syncThemeToSupabase(next);
  const icon = document.getElementById('themeToggleIcon');
  if (icon) icon.textContent = next === 'dark' ? 'light_mode' : 'dark_mode';
}

async function syncThemeToSupabase(theme) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('user_settings').update({ theme }).eq('user_id', session.user.id);
}

export function toast(message, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------- Local date helpers ----------------
// CRITICAL: never use `date.toISOString().slice(0,10)` on a Date built from
// local Y/M/D components (e.g. `new Date(year, month, day)` or `new Date()`).
// toISOString() first converts to UTC, which silently rolls the date
// backward for any timezone ahead of UTC (e.g. IST, UTC+5:30) — a local
// midnight becomes the previous day in UTC. That bug was cutting the last
// day off month ranges, shifting bulk-marked dates back a day, and could
// make "today" wrong. Always build the ISO string from local components.
export function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function highlightNav(pageName) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-nav') === pageName);
  });
}

export function wireLogout() {
  document.querySelectorAll('[data-logout]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
    });
  });
}

export async function loadUserChip() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: profile } = await cachedTable(
    `profile_${session.user.id}`,
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
  );
  if (!profile) return null;
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = profile.full_name);
  document.querySelectorAll('[data-user-roll]').forEach(el => el.textContent = profile.roll_number);
  document.querySelectorAll('[data-user-initial]').forEach(el => el.textContent = initials(profile.full_name));
  document.querySelectorAll('[data-user-branch]').forEach(el => el.textContent = `${profile.branch} • ${profile.section}`);
  return profile;
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

// ---------------- PWA install prompt ----------------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.querySelectorAll('.install-banner').forEach(el => el.classList.add('show'));
});

export function wireInstallBanner() {
  document.querySelectorAll('[data-install-btn]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) { toast('App is already installed or install is unavailable.'); return; }
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      document.querySelectorAll('.install-banner').forEach(el => el.classList.remove('show'));
    });
  });
  document.querySelectorAll('[data-install-dismiss]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.install-banner').forEach(el => el.classList.remove('show'));
    });
  });
}

// ---------------- Service worker + background sync ----------------
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js');
      if ('SyncManager' in window && reg.sync) {
        document.addEventListener('sat:queued-write', () => {
          reg.sync.register('sync-attendance').catch(() => {});
        });
      }
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
}

export function watchOnlineStatus() {
  const banner = document.getElementById('offlineBanner');
  const update = () => {
    if (!banner) return;
    banner.style.display = navigator.onLine ? 'none' : 'flex';
  };
  window.addEventListener('online', () => { update(); toast('Back online — syncing changes…'); flushOfflineQueue(); });
  window.addEventListener('offline', update);
  update();
}

// ---------------- Offline write queue (IndexedDB-backed via localForage-lite) ----------------
const QUEUE_KEY = 'sat_offline_queue';

export function queueOfflineWrite(op) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  queue.push({ ...op, ts: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  document.dispatchEvent(new CustomEvent('sat:queued-write'));
}

export async function flushOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!queue.length) return;
  const remaining = [];
  for (const op of queue) {
    try {
      if (op.table === 'attendance' && op.action === 'delete') {
        await supabase.from('attendance').delete()
          .eq('user_id', op.payload.user_id).eq('subject_id', op.payload.subject_id).eq('date', op.payload.date);
      } else if (op.table === 'attendance') {
        await supabase.from('attendance').upsert(op.payload, { onConflict: 'user_id,subject_id,date' });
      }
    } catch (err) {
      remaining.push(op);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  if (remaining.length === 0) toast('All offline changes synced ✓');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') flushOfflineQueue();
  });
}

export function pendingSyncCount() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]').length;
}

// ---------------- Offline read cache ----------------
// The write queue above lets you mark attendance offline, but until now
// reading (dashboard/calendar/reports) went straight to Supabase with no
// fallback, so opening the app offline showed a blank page even though the
// data had been fetched before. cachedTable() wraps a Supabase read: on
// success it stores the result under a per-user key; on failure (offline,
// DNS, etc.) it serves the last cached copy instead of null, and tags the
// result so the UI can show a "showing offline data" hint if it wants to.
const READ_CACHE_PREFIX = 'sat_cache_';

export async function cachedTable(cacheKey, queryPromise) {
  const key = READ_CACHE_PREFIX + cacheKey;
  try {
    const { data, error } = await queryPromise;
    if (error) throw error;
    localStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }));
    return { data, fromCache: false };
  } catch (err) {
    const stored = localStorage.getItem(key);
    if (stored) {
      const { data, cachedAt } = JSON.parse(stored);
      return { data, fromCache: true, cachedAt };
    }
    return { data: null, fromCache: false, error: err };
  }
}

initTheme();

export async function initShell(pageName) {
  const session = await requireSession();
  if (!session) return null;
  wireLogout();
  wireInstallBanner();
  watchOnlineStatus();
  registerServiceWorker();
  highlightNav(pageName);

  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
  const icon = document.getElementById('themeToggleIcon');
  const iconMobile = document.getElementById('themeToggleIconMobile');
  const current = document.body.getAttribute('data-theme') || 'light';
  if (icon) icon.textContent = current === 'dark' ? 'light_mode' : 'dark_mode';
  if (iconMobile) iconMobile.textContent = current === 'dark' ? 'light_mode' : 'dark_mode';

  const profile = await loadUserChip();
  const firstNameEl = document.querySelector('[data-user-first-name]');
  if (firstNameEl && profile) firstNameEl.textContent = ', ' + profile.full_name.split(' ')[0];

  const todayChip = document.getElementById('todayChip');
  if (todayChip) {
    todayChip.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  return { session, profile };
}
