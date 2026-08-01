import { supabase } from './supabase-client.js';
import { initShell, localISODate, cachedTable, toast } from './app.js';
import { subjectWiseStatsWithSchedule, averageSubjectPercentage, computeHourStats, distinctDateCount } from './attendance-calc.js';

const shell = await initShell('reports');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

document.getElementById('printBtn').addEventListener('click', () => window.print());

const todayISO = localISODate();

const [{ data: subjects }, { data: attendance, fromCache }, { data: timetable }, { data: settings }] = await Promise.all([
  cachedTable(`subjects_${userId}`, supabase.from('subjects').select('*').order('code')),
  cachedTable(`attendance_${userId}`, supabase.from('attendance').select('*').eq('user_id', userId)),
  cachedTable(`timetable_${userId}`, supabase.from('timetable').select('*').eq('user_id', userId)),
  cachedTable(`semester_settings_${userId}`, supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle())
]);
if (fromCache) toast('Offline — showing last saved data');

const semesterStart = settings?.start_date || todayISO;

const stats = subjectWiseStatsWithSchedule(attendance || [], subjects || [], timetable || [], semesterStart, todayISO);
const avg = averageSubjectPercentage(stats);
const examDays = distinctDateCount(attendance || [], 'exam');

const h = computeHourStats(attendance || [], timetable || [], todayISO);

document.getElementById('rWorking').textContent = `${h.totalWorkingHours}h`;
document.getElementById('rWorkingSub').textContent = `= Present + Absent hours`;

document.getElementById('rPresent').textContent = `${h.presentHours}h`;
document.getElementById('rPresentSub').textContent = `≈ ${h.presentDays.toFixed(1)} day(s) present`;

document.getElementById('rAbsent').textContent = `${h.absentHours}h`;
document.getElementById('rAbsentSub').textContent = `≈ ${h.absentDays.toFixed(1)} day(s) absent`;

document.getElementById('rOverall').textContent = avg.toFixed(1) + '%';
document.getElementById('rExam').textContent = examDays;
document.getElementById('reportTableBody').innerHTML = stats.map(s => `
  <tr>
    <td><strong>${s.subject.code}</strong></td>
    <td>${s.present}</td>
    <td>${s.absent}</td>
    <td>${s.holiday}</td>
    <td>${s.exam}</td>
    <td>${s.workingTotal}</td>
    <td>${s.scheduled}</td>
    <td style="${s.unmarked > 0 ? 'color:var(--absent);font-weight:700;' : 'color:var(--text-dim);'}">${s.unmarked > 0 ? s.unmarked : '—'}</td>
    <td style="font-weight:700;color:${s.percentage >= 75 ? 'var(--present)' : s.percentage >= 60 ? 'var(--accent-deep)' : 'var(--absent)'}">${s.percentage.toFixed(1)}%</td>
  </tr>
`).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:24px;">No attendance records yet.</td></tr>`;
