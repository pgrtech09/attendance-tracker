import { supabase } from './supabase-client.js';
import { initShell, toast, queueOfflineWrite } from './app.js';
import { STATUS_META } from './reference-data.js';

const shell = await initShell('calendar');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

const DOW = ['S','M','T','W','T','F','S'];
document.getElementById('calDow').innerHTML = DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');

let viewDate = new Date();
let attendanceByDate = {}; // date -> [{subject_id, status}]

await renderMonth();

document.getElementById('prevMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() - 1); renderMonth(); });
document.getElementById('nextMonth').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() + 1); renderMonth(); });
document.getElementById('editorClose').addEventListener('click', () => document.getElementById('editorBackdrop').classList.remove('show'));

async function renderMonth() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  document.getElementById('monthLabel').textContent = viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const rangeStart = monthStart.toISOString().slice(0, 10);
  const rangeEnd = monthEnd.toISOString().slice(0, 10);

  const { data } = await supabase.from('attendance').select('date, subject_id, status')
    .eq('user_id', userId).gte('date', rangeStart).lte('date', rangeEnd);

  attendanceByDate = {};
  (data || []).forEach(row => {
    if (!attendanceByDate[row.date]) attendanceByDate[row.date] = [];
    attendanceByDate[row.date].push(row);
  });

  const grid = document.getElementById('calGrid');
  const firstWeekday = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const todayISO = new Date().toISOString().slice(0, 10);

  let cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, other: false, iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  while (cells.length % 7 !== 0) cells.push({ day: cells.length, other: true });

  grid.innerHTML = cells.map(c => {
    if (c.other) return `<div class="cal-day other-month">${c.day}</div>`;
    const records = attendanceByDate[c.iso] || [];
    const dots = records.slice(0, 4).map(r => `<span class="dot" style="background:${STATUS_META[r.status]?.color || '#999'}"></span>`).join('');
    return `<div class="cal-day ${c.iso === todayISO ? 'today' : ''}" data-date="${c.iso}"><span>${c.day}</span><div class="dots">${dots}</div></div>`;
  }).join('');

  grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', () => openEditor(el.dataset.date));
  });
}

async function openEditor(dateISO) {
  const weekday = new Date(dateISO + 'T00:00:00').getDay();
  const { data: timetable } = await supabase.from('timetable').select('*, subjects(*)')
    .eq('user_id', userId).eq('weekday', weekday).order('period_order');

  document.getElementById('editorDateLabel').textContent = new Date(dateISO + 'T00:00:00')
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const list = document.getElementById('editorSubjectList');
  if (!timetable || timetable.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="material-icons-round">event_busy</span><p>No classes scheduled on this weekday.</p></div>`;
  } else {
    const existing = attendanceByDate[dateISO] || [];
    list.innerHTML = timetable.map(t => {
      const rec = existing.find(e => e.subject_id === t.subject_id);
      const meta = [t.faculty, t.room].filter(Boolean).join(' · ');
      return `
        <div style="margin-bottom:16px;" data-subject-id="${t.subject_id}">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px;">${t.subjects.code} <span class="hint">${t.start_time}${meta ? ' · ' + meta : ''}</span></div>
          <div class="stamp-row">
            ${Object.entries(STATUS_META).map(([key, sm]) => `
              <button class="stamp ${rec?.status === key ? 'selected' : ''}" data-status="${key}" data-subject="${t.subject_id}">${sm.label}</button>
            `).join('')}
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.stamp').forEach(btn => {
      btn.addEventListener('click', async () => {
        const subjectId = btn.dataset.subject;
        const status = btn.dataset.status;
        btn.closest('div[data-subject-id]').querySelectorAll('.stamp').forEach(b => b.classList.toggle('selected', b === btn));
        const payload = { user_id: userId, subject_id: subjectId, date: dateISO, status };

        if (!attendanceByDate[dateISO]) attendanceByDate[dateISO] = [];
        const idx = attendanceByDate[dateISO].findIndex(r => r.subject_id === subjectId);
        if (idx >= 0) attendanceByDate[dateISO][idx] = payload; else attendanceByDate[dateISO].push(payload);

        if (!navigator.onLine) {
          queueOfflineWrite({ table: 'attendance', payload });
          toast('Saved offline — will sync later');
        } else {
          const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'user_id,subject_id,date' });
          if (error) { queueOfflineWrite({ table: 'attendance', payload }); toast('Save failed — queued for retry'); }
          else toast('Saved ✓');
        }
        renderMonth();
      });
    });
  }

  document.getElementById('editorBackdrop').classList.add('show');
}
