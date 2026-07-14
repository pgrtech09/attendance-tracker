import { supabase } from './supabase-client.js';
import { initShell, toast, queueOfflineWrite } from './app.js';
import { STATUS_META } from './reference-data.js';
import { tallyRecords, subjectWiseStats, targetProjection } from './attendance-calc.js';

const shell = await initShell('attendance');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;
const todayISO = new Date().toISOString().slice(0, 10);
const weekday = new Date().getDay();

let subjectsCache = [];
let attendanceCache = [];
let settingsCache = null;

await loadAll();

async function loadAll() {
  const [{ data: subjects }, { data: timetable }, { data: attendance }, { data: settings }] = await Promise.all([
    supabase.from('subjects').select('*').order('code'),
    supabase.from('timetable').select('*, subjects(*)').eq('user_id', userId).eq('weekday', weekday).order('period_order'),
    supabase.from('attendance').select('*').eq('user_id', userId),
    supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle()
  ]);
  subjectsCache = subjects || [];
  attendanceCache = attendance || [];
  settingsCache = settings;

  document.getElementById('targetInput').value = settings?.target_percentage ?? 75;

  renderTodayStamps(timetable || []);
  renderTargetPanel();
  renderSubjectList();
}

function renderTodayStamps(timetable) {
  const container = document.getElementById('todayStampList');
  if (timetable.length === 0) {
    container.innerHTML = `<div class="empty-state card"><span class="material-icons-round">weekend</span><p>No classes scheduled today.</p></div>`;
    return;
  }
  container.innerHTML = timetable.map(t => {
    const record = attendanceCache.find(a => a.subject_id === t.subject_id && a.date === todayISO);
    const meta = [t.faculty, t.room].filter(Boolean).join(' · ');
    return `
      <div class="card" style="margin-bottom:14px;" data-subject-id="${t.subject_id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div><strong>${t.subjects.code}</strong><div class="hint">${t.subjects.name} · ${t.start_time}–${t.end_time}${meta ? ' · ' + meta : ''}</div></div>
        </div>
        <div class="stamp-row">
          ${Object.entries(STATUS_META).map(([key, meta]) => `
            <button class="stamp ${record?.status === key ? 'selected' : ''}" data-status="${key}" data-subject="${t.subject_id}">${meta.label}</button>
          `).join('')}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.stamp').forEach(btn => {
    btn.addEventListener('click', () => markAttendance(btn.dataset.subject, todayISO, btn.dataset.status, btn.closest('.card')));
  });
}

async function markAttendance(subjectId, date, status, cardEl) {
  const payload = { user_id: userId, subject_id: subjectId, date, status };
  cardEl.querySelectorAll('.stamp').forEach(b => b.classList.toggle('selected', b.dataset.status === status));

  const existingIdx = attendanceCache.findIndex(a => a.subject_id === subjectId && a.date === date);
  if (existingIdx >= 0) attendanceCache[existingIdx] = { ...attendanceCache[existingIdx], ...payload };
  else attendanceCache.push(payload);

  if (!navigator.onLine) {
    queueOfflineWrite({ table: 'attendance', payload });
    toast('Saved offline — will sync when online');
    renderTargetPanel();
    renderSubjectList();
    return;
  }

  const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'user_id,subject_id,date' });
  if (error) {
    toast('Could not save — queued for retry');
    queueOfflineWrite({ table: 'attendance', payload });
  } else {
    toast(`Marked ${STATUS_META[status].label}`);
  }
  renderTargetPanel();
  renderSubjectList();
}

function renderTargetPanel() {
  const overall = tallyRecords(attendanceCache);
  const target = Number(document.getElementById('targetInput').value);
  const proj = targetProjection(overall.present, overall.workingTotal, target);
  document.getElementById('targetCurrent').textContent = `${proj.currentPct}%`;
  document.getElementById('targetRequired').textContent = proj.classesRequired;
  document.getElementById('targetBunkable').textContent = proj.bunkable;
  document.getElementById('targetProgressFill').style.width = Math.min(100, proj.currentPct) + '%';
  document.getElementById('targetProgressFill').style.background = proj.onTrack ? 'var(--present)' : 'var(--absent)';
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
  const list = document.getElementById('subjectList');
  if (stats.length === 0) {
    list.innerHTML = `<div class="empty-state card"><span class="material-icons-round">menu_book</span><p>No subjects yet.</p></div>`;
    return;
  }
  list.innerHTML = stats.map(s => `
    <div class="subject-row">
      <div class="s-icon">${s.subject.code.slice(0, 4)}</div>
      <div class="s-body">
        <div class="s-top"><span>${s.subject.code}</span><span class="pct" style="color:${s.percentage >= 75 ? 'var(--present)' : s.percentage >= 60 ? 'var(--accent-deep)' : 'var(--absent)'}">${s.percentage.toFixed(1)}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, s.percentage)}%;background:${s.percentage >= 75 ? 'var(--present)' : s.percentage >= 60 ? 'var(--accent)' : 'var(--absent)'};"></div></div>
        <div class="s-meta">
          <span>Present: ${s.present}</span><span>Absent: ${s.absent}</span><span>Total: ${s.workingTotal}</span>
        </div>
      </div>
    </div>
  `).join('');
}
