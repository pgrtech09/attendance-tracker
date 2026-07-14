import { STATUS_META } from './reference-data.js';

// A single record shape expected everywhere in this module:
// { subject_id, status, date }

export function tallyRecords(records) {
  const tally = {
    present: 0, absent: 0, holiday: 0, exam: 0,
    non_working: 0, medical_leave: 0, od: 0
  };
  for (const r of records) {
    if (tally.hasOwnProperty(r.status)) tally[r.status]++;
  }
  const workingTotal = tally.present + tally.absent; // classes that count toward %
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
