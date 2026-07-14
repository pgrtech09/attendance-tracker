import { supabase } from './supabase-client.js';
import { initShell, toast, toggleTheme } from './app.js';
import { SUBJECTS, WEEKDAYS } from './reference-data.js';
import { subjectWiseStats } from './attendance-calc.js';

const shell = await initShell('settings');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;
const profile = shell.profile;

let subjectsCache = [];
let activeWeekday = new Date().getDay() === 0 ? 1 : new Date().getDay();

document.getElementById('darkModeSwitch').checked = (document.body.getAttribute('data-theme') === 'dark');
document.getElementById('darkModeSwitch').addEventListener('change', toggleTheme);

await loadSemesterSettings();
await loadHolidays();
await loadSubjects();
renderWeekdayTabs();
await loadTimetableForDay(activeWeekday);
await loadNotificationSettings();

// ---------------- Semester settings ----------------
async function loadSemesterSettings() {
  const { data } = await supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle();
  if (data) {
    document.getElementById('semStart').value = data.start_date || '';
    document.getElementById('semEnd').value = data.end_date || '';
    document.getElementById('semTarget').value = data.target_percentage || 75;
    updateRemainingHint(data);
  }
}

function updateRemainingHint(data) {
  if (!data.end_date) return;
  const today = new Date();
  const end = new Date(data.end_date);
  const days = Math.max(0, Math.ceil((end - today) / 86400000));
  document.getElementById('remainingHint').textContent = `${days} calendar days remaining until semester end.`;
}

document.getElementById('saveSemesterBtn').addEventListener('click', async () => {
  const payload = {
    start_date: document.getElementById('semStart').value,
    end_date: document.getElementById('semEnd').value,
    target_percentage: Number(document.getElementById('semTarget').value)
  };
  const { error } = await supabase.from('semester_settings').update(payload).eq('user_id', userId);
  if (error) toast('Failed to save'); else { toast('Semester settings saved ✓'); updateRemainingHint(payload); }
});

// ---------------- Holidays ----------------
async function loadHolidays() {
  const { data } = await supabase.from('holidays').select('*').eq('user_id', userId).order('date');
  const list = document.getElementById('holidayList');
  if (!data || data.length === 0) {
    list.innerHTML = `<p class="hint">No holidays or exam dates added yet.</p>`;
    return;
  }
  const typeLabel = { holiday: 'Holiday', mid_exam: 'Mid Exam', external_exam: 'External Exam', non_working: 'Non-Working' };
  list.innerHTML = data.map(h => `
    <div class="class-item">
      <div class="time">${h.date}</div>
      <div class="name">${h.name || typeLabel[h.type]}<div class="tag">${typeLabel[h.type]}</div></div>
      <button class="icon-btn" data-del-holiday="${h.id}" style="width:32px;height:32px;"><span class="material-icons-round" style="font-size:16px;">delete</span></button>
    </div>
  `).join('');
  list.querySelectorAll('[data-del-holiday]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('holidays').delete().eq('id', btn.dataset.delHoliday);
      toast('Removed');
      loadHolidays();
    });
  });
}

document.getElementById('addHolidayBtn').addEventListener('click', async () => {
  const date = document.getElementById('holidayDate').value;
  const type = document.getElementById('holidayType').value;
  const name = document.getElementById('holidayName').value.trim();
  if (!date) { toast('Pick a date first'); return; }
  const { error } = await supabase.from('holidays').insert({ user_id: userId, date, type, name });
  if (error) toast('Failed to add'); else { toast('Added ✓'); document.getElementById('holidayName').value = ''; loadHolidays(); }
});

// ---------------- Timetable editor ----------------
async function loadSubjects() {
  const { data } = await supabase.from('subjects').select('*').order('code');
  subjectsCache = data || [];
}

function renderWeekdayTabs() {
  const container = document.getElementById('ttWeekdayTabs');
  container.innerHTML = WEEKDAYS.map((d, i) => i === 0 ? '' : `<button class="btn btn-sm ${i === activeWeekday ? 'btn-accent' : 'btn-ghost'}" data-wd="${i}">${d.slice(0, 3)}</button>`).join('');
  container.querySelectorAll('[data-wd]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeWeekday = Number(btn.dataset.wd);
      renderWeekdayTabs();
      loadTimetableForDay(activeWeekday);
    });
  });
}

async function loadTimetableForDay(weekday) {
  const { data } = await supabase.from('timetable').select('*, subjects(*)').eq('user_id', userId).eq('weekday', weekday).order('period_order');
  const list = document.getElementById('ttPeriodList');
  if (!data || data.length === 0) {
    list.innerHTML = `<p class="hint">No periods on ${WEEKDAYS[weekday]}. Add one below.</p>`;
    return;
  }
  list.innerHTML = data.map(row => `
    <div class="field-row" style="align-items:flex-end;margin-bottom:10px;flex-wrap:wrap;" data-row-id="${row.id}">
      <div class="field" style="margin-bottom:0;">
        <label>Subject</label>
        <select class="tt-subject">
          ${subjectsCache.map(s => `<option value="${s.id}" ${s.id === row.subject_id ? 'selected' : ''}>${s.code}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="max-width:110px;margin-bottom:0;"><label>Start</label><input type="time" class="tt-start" value="${row.start_time}"></div>
      <div class="field" style="max-width:110px;margin-bottom:0;"><label>End</label><input type="time" class="tt-end" value="${row.end_time}"></div>
      <div class="field" style="max-width:130px;margin-bottom:0;"><label>Faculty</label><input type="text" class="tt-faculty" value="${row.faculty || ''}" placeholder="e.g. PVS"></div>
      <div class="field" style="max-width:120px;margin-bottom:0;"><label>Room</label><input type="text" class="tt-room" value="${row.room || ''}" placeholder="e.g. CC LAB"></div>
      <button class="icon-btn tt-save" style="margin-bottom:0;"><span class="material-icons-round" style="font-size:16px;">save</span></button>
      <button class="icon-btn tt-delete" style="margin-bottom:0;"><span class="material-icons-round" style="font-size:16px;">delete</span></button>
    </div>
  `).join('');

  list.querySelectorAll('[data-row-id]').forEach(rowEl => {
    const id = rowEl.dataset.rowId;
    rowEl.querySelector('.tt-save').addEventListener('click', async () => {
      const payload = {
        subject_id: rowEl.querySelector('.tt-subject').value,
        start_time: rowEl.querySelector('.tt-start').value,
        end_time: rowEl.querySelector('.tt-end').value,
        faculty: rowEl.querySelector('.tt-faculty').value.trim() || null,
        room: rowEl.querySelector('.tt-room').value.trim() || null
      };
      const { error } = await supabase.from('timetable').update(payload).eq('id', id);
      if (error) toast('Failed to save period'); else toast('Period saved ✓');
    });
    rowEl.querySelector('.tt-delete').addEventListener('click', async () => {
      await supabase.from('timetable').delete().eq('id', id);
      toast('Period removed');
      loadTimetableForDay(activeWeekday);
    });
  });
}

document.getElementById('addPeriodBtn').addEventListener('click', async () => {
  if (subjectsCache.length === 0) { toast('No subjects available'); return; }
  const { data: existing } = await supabase.from('timetable').select('period_order').eq('user_id', userId).eq('weekday', activeWeekday).order('period_order', { ascending: false }).limit(1);
  const nextOrder = existing && existing.length ? existing[0].period_order + 1 : 1;
  const { error } = await supabase.from('timetable').insert({
    user_id: userId, weekday: activeWeekday, period_order: nextOrder,
    subject_id: subjectsCache[0].id, start_time: '09:30', end_time: '10:20', duration_periods: 1
  });
  if (error) toast('Failed to add period'); else loadTimetableForDay(activeWeekday);
});

// ---------------- Notifications ----------------
async function loadNotificationSettings() {
  const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  if (data) {
    document.getElementById('notifSwitch').checked = !!data.notifications_enabled;
    document.getElementById('morningTime').value = data.morning_reminder_time || '08:30';
    document.getElementById('eveningTime').value = data.evening_reminder_time || '18:00';
  }
}

document.getElementById('saveNotifBtn').addEventListener('click', async () => {
  const enabled = document.getElementById('notifSwitch').checked;
  if (enabled && 'Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  const payload = {
    notifications_enabled: enabled,
    morning_reminder_time: document.getElementById('morningTime').value,
    evening_reminder_time: document.getElementById('eveningTime').value
  };
  const { error } = await supabase.from('user_settings').update(payload).eq('user_id', userId);
  if (error) { toast('Failed to save'); return; }
  scheduleLocalReminders(payload);
  toast('Notification settings saved ✓');
});

function scheduleLocalReminders(settings) {
  if (!settings.notifications_enabled || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.active?.postMessage({
      type: 'SCHEDULE_REMINDERS',
      morning: settings.morning_reminder_time,
      evening: settings.evening_reminder_time
    });
  });
}

// ---------------- Backup / Restore / Export ----------------
document.getElementById('backupBtn').addEventListener('click', async () => {
  const [{ data: attendance }, { data: timetable }, { data: holidays }, { data: settings }] = await Promise.all([
    supabase.from('attendance').select('*').eq('user_id', userId),
    supabase.from('timetable').select('*').eq('user_id', userId),
    supabase.from('holidays').select('*').eq('user_id', userId),
    supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle()
  ]);
  const backup = { exportedAt: new Date().toISOString(), profile, attendance, timetable, holidays, settings };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `attendance-backup-${profile.roll_number}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded ✓');
});

document.getElementById('restoreInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (Array.isArray(backup.attendance) && backup.attendance.length) {
      const rows = backup.attendance.map(r => ({ ...r, user_id: userId }));
      const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'user_id,subject_id,date' });
      if (error) throw error;
    }
    if (Array.isArray(backup.holidays) && backup.holidays.length) {
      const rows = backup.holidays.map(({ id, ...r }) => ({ ...r, user_id: userId }));
      await supabase.from('holidays').insert(rows);
    }
    toast('Backup restored ✓');
    loadHolidays();
  } catch (err) {
    toast('Restore failed: invalid backup file');
  }
});

document.getElementById('exportPdfBtn').addEventListener('click', async () => {
  const { data: attendance } = await supabase.from('attendance').select('*').eq('user_id', userId);
  const stats = subjectWiseStats(attendance || [], subjectsCache);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text('Attendance Report', 14, 18);
  doc.setFontSize(10); doc.text(`${profile.full_name} (${profile.roll_number}) — ${profile.branch} ${profile.section}`, 14, 26);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32);

  let y = 44;
  doc.setFontSize(11);
  doc.text('Subject', 14, y); doc.text('Present', 90, y); doc.text('Absent', 120, y); doc.text('Total', 150, y); doc.text('%', 175, y);
  y += 6;
  doc.setLineWidth(0.2); doc.line(14, y - 4, 196, y - 4);
  stats.forEach(s => {
    doc.text(s.subject.code, 14, y);
    doc.text(String(s.present), 90, y);
    doc.text(String(s.absent), 120, y);
    doc.text(String(s.workingTotal), 150, y);
    doc.text(s.percentage.toFixed(1) + '%', 175, y);
    y += 8;
  });
  doc.save(`attendance-report-${profile.roll_number}.pdf`);
  toast('PDF exported ✓');
});

document.getElementById('exportExcelBtn').addEventListener('click', async () => {
  const { data: attendance } = await supabase.from('attendance').select('*, subjects(code,name)').eq('user_id', userId).order('date');
  const rows = (attendance || []).map(r => ({
    Date: r.date, Subject: r.subjects?.code, Status: r.status
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, `attendance-${profile.roll_number}.xlsx`);
  toast('Excel file exported ✓');
});

// ---------------- Reset attendance ----------------
document.getElementById('resetBtn').addEventListener('click', () => {
  document.getElementById('confirmBackdrop').classList.add('show');
});
document.getElementById('confirmCancel').addEventListener('click', () => {
  document.getElementById('confirmBackdrop').classList.remove('show');
});
document.getElementById('confirmOk').addEventListener('click', async () => {
  const { error } = await supabase.from('attendance').delete().eq('user_id', userId);
  document.getElementById('confirmBackdrop').classList.remove('show');
  if (error) toast('Failed to reset'); else toast('All attendance records deleted');
});
