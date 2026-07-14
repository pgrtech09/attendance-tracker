import { supabase } from './supabase-client.js';
import { initShell } from './app.js';
import { tallyRecords, subjectWiseStats, averageSubjectPercentage, computeHourStats } from './attendance-calc.js';

const shell = await initShell('reports');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

document.getElementById('printBtn').addEventListener('click', () => window.print());

const todayISO = new Date().toISOString().slice(0, 10);

const [{ data: subjects }, { data: attendance }, { data: timetable }] = await Promise.all([
  supabase.from('subjects').select('*').order('code'),
  supabase.from('attendance').select('*').eq('user_id', userId),
  supabase.from('timetable').select('*').eq('user_id', userId)
]);

const overall = tallyRecords(attendance || []);
const stats = subjectWiseStats(attendance || [], subjects || []);
const avg = averageSubjectPercentage(stats);

const h = computeHourStats(attendance || [], timetable || [], todayISO);

document.getElementById('rWorking').textContent = `${h.totalWorkingHours}h`;
document.getElementById('rWorkingSub').textContent = `= Present + Absent hours`;

document.getElementById('rPresent').textContent = `${h.presentHours}h`;
document.getElementById('rPresentSub').textContent = `≈ ${h.presentDays.toFixed(1)} day(s) present`;

document.getElementById('rAbsent').textContent = `${h.absentHours}h`;
document.getElementById('rAbsentSub').textContent = `≈ ${h.absentDays.toFixed(1)} day(s) absent`;

document.getElementById('rOverall').textContent = avg.toFixed(1) + '%';
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
