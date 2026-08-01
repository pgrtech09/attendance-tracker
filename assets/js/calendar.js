import { supabase } from './supabase-client.js';
import { initShell, localISODate, cachedTable } from './app.js';
import { STATUS_META } from './reference-data.js';

const shell = await initShell('calendar');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
document.getElementById('calDow').innerHTML = DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');

let viewDate = new Date();
let attendanceByDate = {};

await renderMonth();

document.getElementById('prevMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() - 1); renderMonth(); });
document.getElementById('nextMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() + 1); renderMonth(); });
document.getElementById('dayViewClose').addEventListener('click', () => document.getElementById('dayViewBackdrop').classList.remove('show'));

async function renderMonth() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  document.getElementById('monthLabel').textContent = viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const rangeStart = localISODate(monthStart);
  const rangeEnd = localISODate(monthEnd);

  const { data } = await cachedTable(
    `calendar_${userId}_${rangeStart}`,
    supabase.from('attendance').select('date, subject_id, status, subjects(code, name)')
      .eq('user_id', userId).gte('date', rangeStart).lte('date', rangeEnd)
  );

  attendanceByDate = {};
  (data || []).forEach(row => {
    if (!attendanceByDate[row.date]) attendanceByDate[row.date] = [];
    attendanceByDate[row.date].push(row);
  });

  const grid = document.getElementById('calGrid');
  const firstWeekday = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const todayISO = localISODate();

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, other: true });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, other: false, iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  let nextMonthDay = 1;
  while (cells.length % 7 !== 0) cells.push({ day: nextMonthDay++, other: true });

  grid.innerHTML = cells.map(c => {
    if (c.other) return `<div class="cal-day other-month">${c.day}</div>`;
    const records = attendanceByDate[c.iso] || [];
    const uniqueStatuses = [...new Set(records.map(r => r.status))];
    const dots = uniqueStatuses.slice(0, 4).map(s => `<span class="dot" style="background:${STATUS_META[s]?.color || '#999'}"></span>`).join('');
    return `<div class="cal-day ${c.iso === todayISO ? 'today' : ''}" data-date="${c.iso}"><span>${c.day}</span><div class="dots">${dots}</div></div>`;
  }).join('');

  grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', () => openDayView(el.dataset.date));
  });
}

function openDayView(dateISO) {
  document.getElementById('dayViewLabel').textContent = new Date(dateISO + 'T00:00:00')
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const records = attendanceByDate[dateISO] || [];
  const list = document.getElementById('dayViewList');
  if (records.length === 0) {
    list.innerHTML = `<p class="hint">No attendance marked on this date.</p>`;
  } else {
    list.innerHTML = records.map(r => `
      <div class="class-item">
        <div class="name">${r.subjects?.code || 'Subject'}<div class="tag">${r.subjects?.name || ''}</div></div>
        <span class="status-pill status-${r.status}">${STATUS_META[r.status]?.label || r.status}</span>
      </div>
    `).join('');
  }
  document.getElementById('dayViewBackdrop').classList.add('show');
}
