import { supabase } from './supabase-client.js';
import { initShell, toast, queueOfflineWrite } from './app.js';
import { STATUS_META, WEEKDAYS } from './reference-data.js';
import { subjectWiseStats, averageSubjectPercentage, targetProjection } from './attendance-calc.js';

const shell = await initShell('attendance');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

const dateInput = document.getElementById('markDate');
const todayISO = new Date().toISOString().slice(0, 10);
dateInput.value = todayISO;
dateInput.max = todayISO; // future dates aren't selectable — attendance can't be known ahead of time

let subjectsCache = [];
let attendanceCache = [];
let selectedDate = todayISO;

await loadSubjectsAndSettings();
await loadDayAndStamps(selectedDate);

dateInput.addEventListener('change', async () => {
  let picked = dateInput.value || todayISO;
  if (picked > todayISO) {
    toast("Can't mark attendance for a future date");
    picked = todayISO;
    dateInput.value = todayISO;
  }
  selectedDate = picked;
  await loadDayAndStamps(selectedDate);
});

async function loadSubjectsAndSettings() {
  const [{ data: subjects }, { data: attendance }, { data: settings }] = await Promise.all([
    supabase.from('subjects').select('*').order('code'),
    supabase.from('attendance').select('*').eq('user_id', userId),
    supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle()
  ]);
  subjectsCache = subjects || [];
  attendanceCache = attendance || [];
  document.getElementById('targetInput').value = settings?.target_percentage ?? 75;
  renderTargetPanel();
  renderSubjectList();
}

async function loadDayAndStamps(dateISO) {
  const weekday = new Date(dateISO + 'T00:00:00').getDay();
  const titleEl = document.getElementById('stampSectionTitle');
  titleEl.textContent = dateISO === todayISO ? "Today's Classes" : `Classes on ${WEEKDAYS[weekday]}, ${dateISO}`;

  if (weekday === 0) {
    document.getElementById('todayStampList').innerHTML =
      `<div class="empty-state card"><span class="material-icons-round">weekend</span><p>Sunday — no classes, automatically excluded from attendance.</p></div>`;
    return;
  }

  const { data: timetable } = await supabase.from('timetable').select('*, subjects(*)')
    .eq('user_id', userId).eq('weekday', weekday).order('period_order');
  renderStamps(timetable || [], dateISO);
}

function renderStamps(timetable, dateISO) {
  const container = document.getElementById('todayStampList');
  updateDayButtonHighlight(timetable, dateISO);

  if (timetable.length === 0) {
    container.innerHTML = `<div class="empty-state card"><span class="material-icons-round">event_busy</span><p>No classes scheduled on this day.</p></div>`;
    return;
  }
  container.innerHTML = timetable.map(t => {
    const record = attendanceCache.find(a => a.subject_id === t.subject_id && a.date === dateISO);
    const meta = [t.faculty, t.room].filter(Boolean).join(' · ');
    const status = record?.status;
    const pillHtml = status
      ? `<span class="status-pill status-${status}">${STATUS_META[status].label}</span>`
      : `<span class="status-pill status-unmarked">Unmarked</span>`;
    return `
      <div class="card" style="margin-bottom:14px;" data-subject-id="${t.subject_id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;">
          <div><strong>${t.subjects.code}</strong><div class="hint">${t.subjects.name} · ${t.start_time}–${t.end_time}${meta ? ' · ' + meta : ''}</div></div>
          ${pillHtml}
        </div>
        <div class="stamp-row">
          <button class="stamp ${status === 'present' ? 'selected' : ''}" data-status="present" data-subject="${t.subject_id}">Present</button>
          <button class="stamp ${status === 'absent' ? 'selected' : ''}" data-status="absent" data-subject="${t.subject_id}">Absent</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.stamp').forEach(btn => {
    btn.addEventListener('click', () => markAttendance(btn.dataset.subject, dateISO, btn.dataset.status, btn.closest('.card')));
  });
}

// Highlights the whole-day Holiday/Exam buttons if every scheduled subject
// on this date already carries that same status.
function updateDayButtonHighlight(timetable, dateISO) {
  const holidayBtn = document.getElementById('dayHolidayBtn');
  const examBtn = document.getElementById('dayExamBtn');
  const records = timetable.map(t => attendanceCache.find(a => a.subject_id === t.subject_id && a.date === dateISO));
  const allHoliday = timetable.length > 0 && records.every(r => r?.status === 'holiday');
  const allExam = timetable.length > 0 && records.every(r => r?.status === 'exam');
  holidayBtn.classList.toggle('selected', allHoliday);
  holidayBtn.dataset.status = 'holiday';
  examBtn.classList.toggle('selected', allExam);
  examBtn.dataset.status = 'exam';
}

async function markWholeDay(dateISO, status) {
  if (dateISO > todayISO) { toast("Can't mark attendance for a future date"); return; }
  const weekday = new Date(dateISO + 'T00:00:00').getDay();
  const { data: timetable } = await supabase.from('timetable').select('subject_id')
    .eq('user_id', userId).eq('weekday', weekday);
  if (!timetable || timetable.length === 0) { toast('No classes scheduled on this day'); return; }

  const payloads = timetable.map(t => ({ user_id: userId, subject_id: t.subject_id, date: dateISO, status }));
  for (const payload of payloads) {
    const idx = attendanceCache.findIndex(a => a.subject_id === payload.subject_id && a.date === dateISO);
    if (idx >= 0) attendanceCache[idx] = { ...attendanceCache[idx], ...payload };
    else attendanceCache.push(payload);
  }

  if (!navigator.onLine) {
    payloads.forEach(p => queueOfflineWrite({ table: 'attendance', payload: p }));
    toast('Saved offline — will sync when online');
  } else {
    const { error } = await supabase.from('attendance').upsert(payloads, { onConflict: 'user_id,subject_id,date' });
    if (error) { toast('Could not save — queued for retry'); payloads.forEach(p => queueOfflineWrite({ table: 'attendance', payload: p })); }
    else toast(`Whole day marked ${STATUS_META[status].label} ✓`);
  }
  await loadDayAndStamps(dateISO);
  renderTargetPanel();
  renderSubjectList();
}

document.getElementById('dayHolidayBtn').addEventListener('click', () => markWholeDay(selectedDate, 'holiday'));
document.getElementById('dayExamBtn').addEventListener('click', () => markWholeDay(selectedDate, 'exam'));

async function markAttendance(subjectId, date, status, cardEl) {
  if (date > todayISO) {
    toast("Can't mark attendance for a future date");
    return;
  }
  const payload = { user_id: userId, subject_id: subjectId, date, status };
  cardEl.querySelectorAll('.stamp').forEach(b => b.classList.toggle('selected', b.dataset.status === status));

  const existingIdx = attendanceCache.findIndex(a => a.subject_id === subjectId && a.date === date);
  if (existingIdx >= 0) attendanceCache[existingIdx] = { ...attendanceCache[existingIdx], ...payload };
  else attendanceCache.push(payload);

  if (!navigator.onLine) {
    queueOfflineWrite({ table: 'attendance', payload });
    toast('Saved offline — will sync when online');
  } else {
    const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'user_id,subject_id,date' });
    if (error) { toast('Could not save — queued for retry'); queueOfflineWrite({ table: 'attendance', payload }); }
    else toast(`Marked ${STATUS_META[status].label}`);
  }
  renderTargetPanel();
  renderSubjectList();
}

function renderTargetPanel() {
  const stats = subjectWiseStats(attendanceCache, subjectsCache);
  const avg = averageSubjectPercentage(stats);
  const target = Number(document.getElementById('targetInput').value);
  const onTrack = avg >= target;

  document.getElementById('targetCurrent').textContent = `${avg.toFixed(1)}%`;
  document.getElementById('targetStatus').textContent = onTrack ? 'On Track' : 'Below Target';
  document.getElementById('targetStatus').style.color = onTrack ? 'var(--present)' : 'var(--absent)';
  document.getElementById('targetProgressFill').style.width = Math.min(100, avg) + '%';
  document.getElementById('targetProgressFill').style.background = onTrack ? 'var(--present)' : 'var(--absent)';
}

document.getElementById('targetInput').addEventListener('change', renderTargetPanel);
document.getElementById('saveTargetBtn').addEventListener('click', async () => {
  const target = Number(document.getElementById('targetInput').value);
  const { error } = await supabase.from('semester_settings').update({ target_percentage: target }).eq('user_id', userId);
  if (error) toast('Failed to save target'); else toast('Target saved ✓');
  renderTargetPanel();
});

function renderSubjectList() {
  const stats = subjectWiseStats(attendanceCache, subjectsCache);
  const target = Number(document.getElementById('targetInput').value);
  const list = document.getElementById('subjectList');
  if (stats.length === 0) {
    list.innerHTML = `<div class="empty-state card"><span class="material-icons-round">menu_book</span><p>No subjects yet.</p></div>`;
    return;
  }
  list.innerHTML = stats.map(s => {
    const proj = targetProjection(s.present, s.workingTotal, target);
    const hint = proj.onTrack
      ? `Can skip ${proj.bunkable} more and stay above ${target}%`
      : `Needs ${proj.classesRequired} more present to reach ${target}%`;
    return `
    <div class="subject-row">
      <div class="s-icon">${s.subject.code.slice(0, 4)}</div>
      <div class="s-body">
        <div class="s-top"><span>${s.subject.code}</span><span class="pct" style="color:${s.percentage >= 75 ? 'var(--present)' : s.percentage >= 60 ? 'var(--accent-deep)' : 'var(--absent)'}">${s.percentage.toFixed(1)}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, s.percentage)}%;background:${s.percentage >= 75 ? 'var(--present)' : s.percentage >= 60 ? 'var(--accent)' : 'var(--absent)'};"></div></div>
        <div class="s-meta">
          <span>Present: ${s.present}</span><span>Absent: ${s.absent}</span><span>Total: ${s.workingTotal}</span><span>${hint}</span>
        </div>
      </div>
    </div>
  `;
  }).join('');
}
