import { supabase } from './supabase-client.js';
import { initShell } from './app.js';
import { tallyRecords, subjectWiseStats, averageSubjectPercentage, computeHourStats } from './attendance-calc.js';

const shell = await initShell('reports');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

document.getElementById('printBtn').addEventListener('click', () => window.print());

const todayISO = new Date().toISOString().slice(0, 10);

const [{ data: subjects }, { data: attendance }, { data: timetable }, { data: settings }, { data: holidays }] = await Promise.all([
  supabase.from('subjects').select('*').order('code'),
  supabase.from('attendance').select('*').eq('user_id', userId),
  supabase.from('timetable').select('*').eq('user_id', userId),
  supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle(),
  supabase.from('holidays').select('date').eq('user_id', userId)
]);

const overall = tallyRecords(attendance || []);
const stats = subjectWiseStats(attendance || [], subjects || []);
const avg = averageSubjectPercentage(stats);

const hourStats = computeHourStats(
  attendance || [], timetable || [],
  settings?.start_date, settings?.end_date,
  (holidays || []).map(h => h.date), todayISO
);

if (!settings?.start_date) {
  document.getElementById('rWorkingSub').textContent = 'Set semester start date in Settings';
} else {
  const h = hourStats;
  document.getElementById('rWorking').textContent = `${h.totalWorkingHours}h`;
  document.getElementById('rWorkingSub').textContent = `${h.workingDays} working day${h.workingDays === 1 ? '' : 's'} so far`;

  document.getElementById('rPresent').textContent = `${h.presentHours}h`;
  const presentDays = h.avgHoursPerDay > 0 ? (h.presentHours / h.avgHoursPerDay).toFixed(1) : '0';
  document.getElementById('rPresentSub').textContent = `≈ ${presentDays} day${presentDays === '1.0' ? '' : 's'} present`;

  document.getElementById('rAbsent').textContent = `${h.absentHours}h`;
  const absentDays = h.avgHoursPerDay > 0 ? (h.absentHours / h.avgHoursPerDay).toFixed(1) : '0';
  document.getElementById('rAbsentSub').textContent = `≈ ${absentDays} day${absentDays === '1.0' ? '' : 's'} absent`;
}

document.getElementById('rOverall').textContent = avg.toFixed(1) + '%';
document.getElementById('rHoliday').textContent = overall.holiday;
document.getElementById('rExam').textContent = overall.exam;
document.getElementById('reportTableBody').innerHTML = stats.map(s => `
  <tr>
    <td><strong>${s.subject.code}</strong></td>
    <td>${s.present}</td>
    <td>${s.absent}</td>
    <td>${s.holiday}</td>
    <td>${s.exam}</td>
    <td>${s.workingTotal}</td>
    <td style="font-weight:700;color:${s.percentage >= 75 ? 'var(--present)' : s.percentage >= 60 ? 'var(--accent-deep)' : 'var(--absent)'}">${s.percentage.toFixed(1)}%</td>
  </tr>
`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:24px;">No attendance records yet.</td></tr>`;
