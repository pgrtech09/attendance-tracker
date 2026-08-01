import { supabase } from './supabase-client.js';
import { initShell, toast, localISODate, cachedTable } from './app.js';
import { WEEKDAYS } from './reference-data.js';
import { subjectWiseStats, averageSubjectPercentage, remainingWorkingDaysInRange, tallyRecords, targetProjection } from './attendance-calc.js';

const shell = await initShell('dashboard');
if (shell) await loadDashboard(shell.session.user.id);

async function loadDashboard(userId) {
  const todayISO = localISODate();
  const weekday = new Date().getDay();
  document.getElementById('weekdayLabel').textContent = WEEKDAYS[weekday];

  const [{ data: subjects }, { data: timetable }, { data: attendance, fromCache }, { data: settings }, { data: holidays }] = await Promise.all([
    cachedTable(`subjects_${userId}`, supabase.from('subjects').select('*').order('code')),
    cachedTable(`timetable_dow${weekday}_${userId}`, supabase.from('timetable').select('*, subjects(*)').eq('user_id', userId).eq('weekday', weekday).order('period_order')),
    cachedTable(`attendance_${userId}`, supabase.from('attendance').select('*').eq('user_id', userId)),
    cachedTable(`semester_settings_${userId}`, supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle()),
    cachedTable(`holidays_${userId}`, supabase.from('holidays').select('date').eq('user_id', userId))
  ]);
  if (fromCache) toast('Offline — showing last saved data');

  try { renderTodayClasses(timetable || [], attendance || [], todayISO); } catch (e) { console.error('renderTodayClasses failed', e); }
  try { renderStatCards(subjects || [], attendance || [], settings, holidays || [], timetable || []); } catch (e) { console.error('renderStatCards failed', e); }
  try { renderPrediction(attendance || [], settings); } catch (e) { console.error('renderPrediction failed', e); }
}

// Attend next X classes / can miss X classes — based on overall Present vs
// Absent totals across every subject combined, compared against the saved
// target percentage. A simple, single, honest number rather than per-subject
// math, since this card is meant to be read at a glance.
function renderPrediction(attendance, settings) {
  const overall = tallyRecords(attendance);
  const target = settings?.target_percentage ?? 75;
  const proj = targetProjection(overall.present, overall.workingTotal, target);
  const textEl = document.getElementById('predictionText');
  const iconEl = document.getElementById('predictionIcon');

  if (overall.workingTotal === 0) {
    textEl.textContent = 'Mark a few classes to see your prediction here.';
    iconEl.textContent = 'auto_graph';
    return;
  }

  if (proj.onTrack) {
    textEl.textContent = proj.bunkable > 0
      ? `You're at ${proj.currentPct}% — you can miss ${proj.bunkable} more class${proj.bunkable === 1 ? '' : 'es'} and stay above ${target}%.`
      : `You're at ${proj.currentPct}% — right at the edge of ${target}%. Attend your next class to stay safe.`;
    iconEl.textContent = 'check_circle';
    iconEl.style.color = 'var(--present)';
  } else {
    textEl.textContent = `You're at ${proj.currentPct}% — attend your next ${proj.classesRequired} class${proj.classesRequired === 1 ? '' : 'es'} in a row to reach ${target}%.`;
    iconEl.textContent = 'warning';
    iconEl.style.color = 'var(--absent)';
  }
}

function renderTodayClasses(timetable, attendance, todayISO) {
  const list = document.getElementById('todayClassList');
  const statToday = document.getElementById('statToday');
  const statTodaySub = document.getElementById('statTodaySub');
  statToday.textContent = timetable.length;

  if (timetable.length === 0) {
    list.innerHTML = `<div class="empty-state card"><span class="material-icons-round">weekend</span><p>No classes scheduled today. Enjoy the day off!</p></div>`;
    statTodaySub.textContent = 'No classes today';
    return;
  }

  const marked = attendance.filter(a => a.date === todayISO);
  const markedCount = timetable.filter(t => marked.some(m => m.subject_id === t.subject_id)).length;
  statTodaySub.textContent = `${markedCount}/${timetable.length} marked`;

  list.innerHTML = timetable.map(t => {
    const record = marked.find(m => m.subject_id === t.subject_id);
    const statusHtml = record
      ? `<span class="status-pill status-${record.status}">${record.status.replace('_', ' ')}</span>`
      : `<span class="status-pill status-unmarked">Unmarked</span>`;
    const meta = [t.faculty, t.room].filter(Boolean).join(' · ');
    return `
      <div class="class-item">
        <div class="time">${t.start_time}</div>
        <div class="name">${t.subjects.code}<div class="tag">${t.subjects.name}${meta ? ' · ' + meta : ''}</div></div>
        ${statusHtml}
      </div>`;
  }).join('');
}

function renderStatCards(subjects, attendance, settings, holidays, timetable) {
  const stats = subjectWiseStats(attendance, subjects);
  const avg = averageSubjectPercentage(stats);
  document.getElementById('statOverall').textContent = `${avg.toFixed(1)}%`;
  document.getElementById('statOverallSub').textContent = `Average across ${subjects.length} subjects`;

  const target = settings?.target_percentage ?? 75;
  const onTrack = avg >= target;
  document.getElementById('statTarget').textContent = `${target}%`;
  document.getElementById('statTargetSub').textContent = onTrack
    ? `On track — ${avg.toFixed(1)}% average`
    : `Below target — ${avg.toFixed(1)}% average`;

  if (settings?.end_date) {
    const { remainingClasses, remainingDays } = remainingWorkingDaysInRange(
      settings.start_date, settings.end_date, holidays.map(h => h.date)
    );
    document.getElementById('statRemaining').textContent = remainingClasses;
    document.querySelector('#statRemaining').nextElementSibling.textContent = `${remainingDays} working days left`;
  } else {
    document.getElementById('statRemaining').textContent = '–';
  }
}
