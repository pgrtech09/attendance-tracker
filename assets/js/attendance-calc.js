import { STATUS_META } from './reference-data.js';

// `date.toISOString()` always converts to UTC first — for a Date built from
// local calendar components (e.g. `new Date(year, month, day)`), that silently
// shifts the date back a day for anyone in a timezone ahead of UTC (India,
// UTC+5:30, included). This reads the LOCAL calendar date directly instead.
export function toLocalISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todayLocalISO() {
  return toLocalISODate(new Date());
}

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

// If timetableRows is supplied, percentage is computed as
// (present HOURS / total HOURS) * 100 — a 3-hour lab counts 3x as much as a
// 1-hour theory period. present/absent/holiday/exam stay as plain class
// counts (useful as "number of classes"), only the % is hour-weighted.
// Without timetableRows, falls back to the old class-count ratio.
export function subjectWiseStats(records, subjects, timetableRows = []) {
  const bySubject = {};
  for (const s of subjects) bySubject[s.id] = [];
  for (const r of records) {
    if (bySubject[r.subject_id]) bySubject[r.subject_id].push(r);
  }

  const durationByTimetableId = {};
  const durationByWeekdaySubject = {};
  for (const t of timetableRows) {
    durationByTimetableId[t.id] = periodDurationHours(t);
    const key = `${t.weekday}:${t.subject_id}`;
    if (!(key in durationByWeekdaySubject)) durationByWeekdaySubject[key] = periodDurationHours(t);
  }

  function durationOf(record) {
    if (record.timetable_id && durationByTimetableId[record.timetable_id] !== undefined) {
      return durationByTimetableId[record.timetable_id];
    }
    // Fallback for older rows saved before timetable_id existed.
    const dow = new Date(record.date + 'T00:00:00').getDay();
    return durationByWeekdaySubject[`${dow}:${record.subject_id}`] ?? 1;
  }

  return subjects.map(s => {
    const subjRecords = bySubject[s.id] || [];
    const tally = tallyRecords(subjRecords);

    if (timetableRows.length === 0) {
      return { subject: s, ...tally };
    }

    let presentHours = 0;
    let absentHours = 0;
    for (const r of subjRecords) {
      if (r.status === 'present') presentHours += durationOf(r);
      else if (r.status === 'absent') absentHours += durationOf(r);
    }
    const totalHours = presentHours + absentHours;
    const percentage = totalHours === 0 ? 0 : (presentHours / totalHours) * 100;

    return { subject: s, ...tally, presentHours, absentHours, totalHours, percentage };
  });
}

// Overall attendance % = (sum of each subject's own percentage) / (total number
// of subjects) — a simple average across subjects, not a class-count-weighted
// aggregate. A subject with no classes marked yet contributes 0%.
export function averageSubjectPercentage(subjectStats) {
  if (!subjectStats.length) return 0;
  const sum = subjectStats.reduce((acc, s) => acc + s.percentage, 0);
  return sum / subjectStats.length;
}

// Secondary/extra figure, shown alongside (never instead of) the primary
// average-of-subjects percentage. This pools every subject's present/total
// HOURS together across the whole timetable, rather than averaging each
// subject's own percentage — so a subject with many more class-hours than
// another naturally carries more weight here. Requires subjectWiseStats to
// have been called with timetableRows so presentHours/absentHours exist.
export function pooledHourPercentage(subjectStats) {
  let presentHours = 0;
  let totalHours = 0;
  for (const s of subjectStats) {
    if (s.presentHours === undefined) continue; // no timetable data supplied
    presentHours += s.presentHours;
    totalHours += s.presentHours + s.absentHours;
  }
  return totalHours === 0 ? 0 : (presentHours / totalHours) * 100;
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
    const periodsThatDay = byWeekday[dow] || [];
    // Prefer the exact period this record belongs to; fall back to matching
    // by subject only for older rows saved before timetable_id existed
    // (which can't be perfectly disambiguated if that subject occurred more
    // than once that weekday).
    const period = periodsThatDay.find(r => r.id === rec.timetable_id) || periodsThatDay.find(r => r.subject_id === rec.subject_id);
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

export function remainingWorkingDaysInRange(startISO, endISO, holidayDates, todayISO = todayLocalISO()) {
  const start = new Date(Math.max(new Date(todayISO), new Date(startISO)));
  const end = new Date(endISO);
  if (start > end) return { remainingDays: 0, remainingClasses: 0 };
  const holidaySet = new Set(holidayDates);
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = toLocalISODate(cursor);
    const dow = cursor.getDay();
    if (dow !== 0 && !holidaySet.has(iso)) days++; // Sunday off by default
    cursor.setDate(cursor.getDate() + 1);
  }
  return { remainingDays: days, remainingClasses: days * 5 }; // ~5 periods/day average
}
