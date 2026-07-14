import { supabase } from './supabase-client.js';
import { initShell } from './app.js';
import { tallyRecords, subjectWiseStats } from './attendance-calc.js';

const shell = await initShell('reports');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

document.getElementById('printBtn').addEventListener('click', () => window.print());

const [{ data: subjects }, { data: attendance }] = await Promise.all([
  supabase.from('subjects').select('*').order('code'),
  supabase.from('attendance').select('*').eq('user_id', userId)
]);

const overall = tallyRecords(attendance || []);
document.getElementById('rWorking').textContent = overall.workingTotal;
document.getElementById('rPresent').textContent = overall.present;
document.getElementById('rAbsent').textContent = overall.absent;
document.getElementById('rOverall').textContent = overall.percentage.toFixed(1) + '%';
document.getElementById('rHoliday').textContent = overall.holiday;
document.getElementById('rExam').textContent = overall.exam;
document.getElementById('rMedical').textContent = overall.medical_leave;
document.getElementById('rOd').textContent = overall.od;

const stats = subjectWiseStats(attendance || [], subjects || []);
document.getElementById('reportTableBody').innerHTML = stats.map(s => `
  <tr>
    <td><strong>${s.subject.code}</strong></td>
    <td>${s.present}</td>
    <td>${s.absent}</td>
    <td>${s.holiday}</td>
    <td>${s.exam}</td>
    <td>${s.medical_leave}</td>
    <td>${s.od}</td>
    <td>${s.workingTotal}</td>
    <td style="font-weight:700;color:${s.percentage >= 75 ? 'var(--present)' : s.percentage >= 60 ? 'var(--accent-deep)' : 'var(--absent)'}">${s.percentage.toFixed(1)}%</td>
  </tr>
`).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:24px;">No attendance records yet.</td></tr>`;
