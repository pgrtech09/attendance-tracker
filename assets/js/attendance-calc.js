import { STATUS_META } from './reference-data.js';

// A single record shape expected everywhere in this module:
// { subject_id, status, date }

export function tallyRecords(records) {
  const tally = { present: 0, absent: 0, holiday: 0, exam: 0 };
  for (const r of records) {
    if (tally.hasOwnProperty(r.status)) tally[r.status]++;
  }
  const workingTotal = tally.present + tally.absent; // only Present/Absent count toward %
  const percentage = workingTotal === 0 ? 0 : (tally.present / workingTotal) * 100;
  return { ...tally, workingTotal, percentage };
}

export function subjectWiseStats(records, subjects) {
  const bySubject = {};
  for (const s of subjects) bySubject[s.id] = [];
  for (const r of records) {
    if (bySubject[r.subject_id]) bySubject[r.subject_id].push(r);
  }
  return subjects.map(s => ({
    subject: s,
    ...tallyRecords(bySubject[s.id] || [])
  }));
}

// Overall attendance % = (sum of each subject's own percentage) / (total number
// of subjects) — a simple average across subjects, not a class-count-weighted
// aggregate. A subject with no classes marked yet contributes 0%.
export function averageSubjectPercentage(subjectStats) {
  if (!subjectStats.length) return 0;
  const sum = subjectStats.reduce((acc, s) => acc + s.percentage, 0);
  return sum / subjectStats.length;
}

// Classes needed (attending every one) to reach `targetPct`, and how many
// more can safely be missed while staying at/above it, given current
// present/total working-day counts.
export function targetProjection(present, total, targetPct) {
  const target = targetPct / 100;
  const currentPct = total === 0 ? 0 : (present / total) * 100;

  let classesRequired = 0;
  if (target < 1 && (total === 0 || present / total < target)) {
    // (present + x) / (total + x) >= target  =>  x >= (target*total - present) / (1 - target)
    const raw = (target * total - present) / (1 - target);
    classesRequired = Math.max(0, Math.ceil(raw));
  }

  let bunkable = 0;
  if (target > 0 && total > 0 && present / total >= target) {
    // present / (total + y) >= target  =>  y <= present/target - total
    const raw = present / target - total;
    bunkable = Math.max(0, Math.floor(raw));
  }

  return {
    currentPct: Number(currentPct.toFixed(2)),
    classesRequired,
    bunkable,
    onTrack: currentPct >= targetPct
  };
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Real duration of a single timetable period, in hours (e.g. 09:30–10:30 = 1,
// a 13:15–16:15 lab block = 3). Falls back to 1 hour if times are malformed.
export function periodDurationHours(row) {
  if (!row?.start_time || !row?.end_time) return 1;
  const mins = timeToMinutes(row.end_time) - timeToMinutes(row.start_time);
  return mins > 0 ? mins / 60 : 1;
}

// Converts marked attendance into hour-level totals: each Present/Absent
// record is weighted by its real class duration (a 1hr theory period counts
// as 1h, a 3hr lab counts as 3h). Working Hours is simply Present + Absent —
// nothing else (Holiday, Exam, or anything left unmarked) counts as "worked."
// Only counts records dated today or earlier; future dates are ignored since
// attendance can't be known ahead of time.
export function computeHourStats(attendanceRecords, timetableRows, todayISO) {
  const byWeekday = {};
  for (const row of timetableRows) {
    if (!byWeekday[row.weekday]) byWeekday[row.weekday] = [];
    byWeekday[row.weekday].push(row);
  }

  let presentHours = 0;
  let absentHours = 0;
  const markedDates = new Set();

  for (const rec of attendanceRecords) {
    if (rec.date > todayISO) continue; // never count anything dated in the future
    if (rec.status !== 'present' && rec.status !== 'absent') continue;
    const dow = new Date(rec.date + 'T00:00:00').getDay();
    const period = (byWeekday[dow] || []).find(r => r.subject_id === rec.subject_id);
    const hrs = periodDurationHours(period);
    if (rec.status === 'present') presentHours += hrs;
    else absentHours += hrs;
    markedDates.add(rec.date);
  }

  const totalWorkingHours = presentHours + absentHours;
  // A standard day on this timetable is 6 hours (3 morning + 3 afternoon);
  // used only to express hours as an approximate day-count for readability.
  const STANDARD_DAY_HOURS = 6;
  return {
    totalWorkingHours,
    presentHours,
    absentHours,
    markedDays: markedDates.size,
    presentDays: presentHours / STANDARD_DAY_HOURS,
    absentDays: absentHours / STANDARD_DAY_HOURS
  };
}

// Holiday/Exam are day-level facts, not per-subject facts — if 4 subjects on
// the same date are all marked "exam", that's still just 1 exam day, not 4.
// This counts distinct dates carrying a given status, instead of raw rows.
export function distinctDateCount(records, status) {
  const dates = new Set(records.filter(r => r.status === status).map(r => r.date));
  return dates.size;
}

export function statusLabel(status) {
  return STATUS_META[status]?.label || status;
}

export function statusAffectsAttendance(status) {
  return STATUS_META[status]?.affectsAttendance ?? false;
}

export function monthlyBreakdown(records) {
  const byMonth = {};
  for (const r of records) {
    const key = r.date.slice(0, 7); // YYYY-MM
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(r);
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, recs]) => ({ month, ...tallyRecords(recs) }));
}

export function remainingWorkingDaysInRange(startISO, endISO, holidayDates, todayISO = new Date().toISOString().slice(0, 10)) {
  const start = new Date(Math.max(new Date(todayISO), new Date(startISO)));
  const end = new Date(endISO);
  if (start > end) return { remainingDays: 0, remainingClasses: 0 };
  const holidaySet = new Set(holidayDates);
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const dow = cursor.getDay();
    if (dow !== 0 && !holidaySet.has(iso)) days++; // Sunday off by default
    cursor.setDate(cursor.getDate() + 1);
  }
  return { remainingDays: days, remainingClasses: days * 5 }; // ~5 periods/day average
}
