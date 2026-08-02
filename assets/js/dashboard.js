import { supabase } from './supabase-client.js';
import { initShell, toast } from './app.js';
import { WEEKDAYS } from './reference-data.js';
import { subjectWiseStats, averageSubjectPercentage, remainingWorkingDaysInRange, targetProjection, todayLocalISO } from './attendance-calc.js';

const shell = await initShell('dashboard');
if (shell) await loadDashboard(shell.session.user.id);

async function loadDashboard(userId) {
  const todayISO = todayLocalISO();
  const weekday = new Date().getDay();
  document.getElementById('weekdayLabel').textContent = WEEKDAYS[weekday];

  const [{ data: subjects }, { data: timetable }, { data: timetableAll }, { data: attendance }, { data: settings }, { data: holidays }] = await Promise.all([
    supabase.from('subjects').select('*').order('code'),
    supabase.from('timetable').select('*, subjects(*)').eq('user_id', userId).eq('weekday', weekday).order('period_order'),
    supabase.from('timetable').select('*').eq('user_id', userId),
    supabase.from('attendance').select('*').eq('user_id', userId),
    supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('holidays').select('date').eq('user_id', userId)
  ]);

  const stats = subjectWiseStats(attendance || [], subjects || [], timetableAll || []);
  const target = settings?.target_percentage ?? 75;

  try { renderTodayClasses(timetable || [], attendance || [], todayISO); } catch (e) { console.error('renderTodayClasses failed', e); }
  try { renderStatCards(stats, holidays || [], settings, target); } catch (e) { console.error('renderStatCards failed', e); }
  try { renderPrediction(stats, target); } catch (e) { console.error('renderPrediction failed', e); }
}

// Attend next X classes / can miss X classes — based on overall Present vs
// Absent totals across every subject combined, compared against the saved
// target percentage. A simple, single, honest number rather than per-subject
// math, since this card is meant to be read at a glance.
// Uses the exact same per-subject stats that produce the "Overall Attendance"
// card, so the two numbers always agree. Classes-needed and can-skip are
// computed per subject then summed — a subject already above target
// contributes to "can skip", one below target contributes to "needed" —
// so both numbers are shown together instead of picking only one.
function renderPrediction(stats, target) {
  const avg = averageSubjectPercentage(stats);
  const textEl = document.getElementById('predictionText');
  const iconEl = document.getElementById('predictionIcon');

  const withData = stats.filter(s => s.workingTotal > 0);
  if (withData.length === 0) {
    textEl.textContent = 'Mark a few classes to see your prediction here.';
    iconEl.textContent = 'auto_graph';
    return;
  }

  let classesNeeded = 0;
  let canSkip = 0;
  for (const s of stats) {
    const proj = targetProjection(s.present, s.workingTotal, target);
    classesNeeded += proj.classesRequired;
    canSkip += proj.bunkable;
  }

  const onTrack = avg >= target;
  iconEl.textContent = onTrack ? 'check_circle' : 'warning';
  iconEl.style.color = onTrack ? 'var(--present)' : 'var(--absent)';

  const parts = [`You're at ${avg.toFixed(1)}%.`];
  if (classesNeeded > 0) parts.push(`Attend your next ${classesNeeded} class${classesNeeded === 1 ? '' : 'es'} (across subjects below ${target}%) to catch up.`);
  if (canSkip > 0) parts.push(`You can skip ${canSkip} more class${canSkip === 1 ? '' : 'es'} (in subjects already above ${target}%) and stay safe.`);
  if (classesNeeded === 0 && canSkip === 0) parts.push(`Right at the edge of ${target}% everywhere — attend your next few classes to stay safe.`);
  textEl.textContent = parts.join(' ');
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

function renderStatCards(stats, holidays, settings, target) {
  const avg = averageSubjectPercentage(stats);
  document.getElementById('statOverall').textContent = `${avg.toFixed(1)}%`;
  document.getElementById('statOverallSub').textContent = `Average across ${stats.length} subjects`;

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
