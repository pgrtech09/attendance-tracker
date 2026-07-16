import { supabase } from './supabase-client.js';
import { initShell, toast } from './app.js';
import { WEEKDAYS } from './reference-data.js';
import { tallyRecords, subjectWiseStats, averageSubjectPercentage, monthlyBreakdown, remainingWorkingDaysInRange } from './attendance-calc.js';

let pieChart, barChart, lineChart;

const shell = await initShell('dashboard');
if (shell) await loadDashboard(shell.session.user.id);

async function loadDashboard(userId) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const weekday = new Date().getDay();
  document.getElementById('weekdayLabel').textContent = WEEKDAYS[weekday];

  const [{ data: subjects }, { data: timetable }, { data: attendance }, { data: settings }, { data: holidays }] = await Promise.all([
    supabase.from('subjects').select('*').order('code'),
    supabase.from('timetable').select('*, subjects(*)').eq('user_id', userId).eq('weekday', weekday).order('period_order'),
    supabase.from('attendance').select('*').eq('user_id', userId),
    supabase.from('semester_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('holidays').select('date').eq('user_id', userId)
  ]);

  try { renderTodayClasses(timetable || [], attendance || [], todayISO); } catch (e) { console.error('renderTodayClasses failed', e); }
  try { renderStatCards(subjects || [], attendance || [], settings, holidays || [], timetable || []); } catch (e) { console.error('renderStatCards failed', e); }
  try { renderCharts(subjects || [], attendance || []); } catch (e) { console.error('renderCharts failed', e); toast('Charts failed to load — check console for details'); }
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
  const overallCounts = tallyRecords(attendance);
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

function renderCharts(subjects, attendance) {
  const overall = tallyRecords(attendance);
  const pieCtx = document.getElementById('pieChart');
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Absent', 'Holiday', 'Exam'],
      datasets: [{
        data: [overall.present, overall.absent, overall.holiday, overall.exam],
        backgroundColor: ['#2F9E67', '#D64545', '#4C7EA8', '#7D5BA6'],
        borderWidth: 0
      }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, cutout: '65%' }
  });

  const subjStats = subjectWiseStats(attendance, subjects);
  const barCtx = document.getElementById('barChart');
  if (barChart) barChart.destroy();
  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: subjStats.map(s => s.subject.code),
      datasets: [{
        label: 'Attendance %',
        data: subjStats.map(s => Number(s.percentage.toFixed(1))),
        backgroundColor: subjStats.map(s => s.percentage >= 75 ? '#2F9E67' : s.percentage >= 60 ? '#E8A33D' : '#D64545'),
        borderRadius: 6
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } }
    }
  });

  const months = monthlyBreakdown(attendance);
  const lineCtx = document.getElementById('lineChart');
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: months.map(m => m.month),
      datasets: [{
        label: 'Monthly %',
        data: months.map(m => Number(m.percentage.toFixed(1))),
        borderColor: '#E8A33D',
        backgroundColor: 'rgba(232,163,61,.15)',
        fill: true,
        tension: 0.35
      }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
  });
}
