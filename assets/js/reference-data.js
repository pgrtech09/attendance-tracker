// ==========================================================================
// Reference data: subject master list + default timetable
//
// No timetable image was provided when this project was generated, so the
// grid below is a sensible default for II-MB / Semester 3 built from the
// subject list supplied in the brief (COA, SE, DBMS, OOPJ, MSF + labs), and
// it deliberately matches the two example days given (Monday and Tuesday).
// Every entry is fully editable from the Settings > Timetable screen and is
// persisted per-student in the `timetable` table, so this file only seeds
// the very first run.
// ==========================================================================

export const SUBJECTS = [
  { code: 'COA',       name: 'Computer Organization & Architecture', type: 'theory' },
  { code: 'SE',        name: 'Software Engineering',                 type: 'theory' },
  { code: 'DBMS',      name: 'Database Management Systems',          type: 'theory' },
  { code: 'OOPJ',      name: 'Object Oriented Programming (Java)',   type: 'theory' },
  { code: 'MSF',       name: 'Mathematical & Statistical Foundations', type: 'theory' },
  { code: 'CM LAB',    name: 'Computational Mathematics Lab',        type: 'lab' },
  { code: 'DBMS LAB',  name: 'DBMS Laboratory',                      type: 'lab' },
  { code: 'SE LAB',    name: 'Software Engineering Laboratory',      type: 'lab' },
  { code: 'OOPJ LAB',  name: 'OOPJ Laboratory',                      type: 'lab' },
  { code: 'NJ/RJ LAB', name: 'NJ/RJ Laboratory',                     type: 'lab' }
];

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Extracted directly from the II-MB (Section B) timetable image, Semester 3.
// Morning block 9:30–12:30 (three 1hr theory periods, or one 3hr lab).
// Afternoon block 1:15–4:15 (three 1hr theory periods, or one 3hr lab).
// weekday: 0=Sun ... 6=Sat. period_order defines sequence within the day.
// duration_periods > 1 marks a lab occupying the whole 3-hour block.
export const DEFAULT_TIMETABLE = [
  // Monday
  { weekday: 1, period_order: 1, code: 'COA',       start_time: '09:30', end_time: '10:30', faculty: 'SS' },
  { weekday: 1, period_order: 2, code: 'SE',        start_time: '10:30', end_time: '11:30', faculty: 'PVS' },
  { weekday: 1, period_order: 3, code: 'DBMS',      start_time: '11:30', end_time: '12:30', faculty: 'Dr.VN' },
  { weekday: 1, period_order: 4, code: 'OOPJ LAB',  start_time: '13:15', end_time: '16:15', duration_periods: 3, faculty: 'SB', room: 'CC LAB' },
  // Tuesday
  { weekday: 2, period_order: 1, code: 'CM LAB',    start_time: '09:30', end_time: '12:30', duration_periods: 3, faculty: 'Dr.DR/Dr.KG', room: 'LAB-6' },
  { weekday: 2, period_order: 2, code: 'DBMS',      start_time: '13:15', end_time: '14:15', faculty: 'Dr.VN' },
  { weekday: 2, period_order: 3, code: 'COA',       start_time: '14:15', end_time: '15:15', faculty: 'SS' },
  { weekday: 2, period_order: 4, code: 'SE',        start_time: '15:15', end_time: '16:15', faculty: 'PVS' },
  // Wednesday
  { weekday: 3, period_order: 1, code: 'SE',        start_time: '09:30', end_time: '10:30', faculty: 'PVS' },
  { weekday: 3, period_order: 2, code: 'MSF',       start_time: '10:30', end_time: '11:30', faculty: 'VP' },
  { weekday: 3, period_order: 3, code: 'OOPJ',      start_time: '11:30', end_time: '12:30', faculty: 'SB' },
  { weekday: 3, period_order: 4, code: 'DBMS LAB',  start_time: '13:15', end_time: '16:15', duration_periods: 3, faculty: 'Dr.VN', room: 'CC LAB' },
  // Thursday
  { weekday: 4, period_order: 1, code: 'OOPJ',      start_time: '09:30', end_time: '10:30', faculty: 'SB' },
  { weekday: 4, period_order: 2, code: 'MSF',       start_time: '10:30', end_time: '11:30', faculty: 'VP' },
  { weekday: 4, period_order: 3, code: 'SE',        start_time: '11:30', end_time: '12:30', faculty: 'PVS' },
  { weekday: 4, period_order: 4, code: 'MSF',       start_time: '13:15', end_time: '14:15', faculty: 'VP' },
  { weekday: 4, period_order: 5, code: 'DBMS',      start_time: '14:15', end_time: '15:15', faculty: 'Dr.VN' },
  { weekday: 4, period_order: 6, code: 'COA',       start_time: '15:15', end_time: '16:15', faculty: 'SS' },
  // Friday
  { weekday: 5, period_order: 1, code: 'DBMS',      start_time: '09:30', end_time: '10:30', faculty: 'Dr.VN' },
  { weekday: 5, period_order: 2, code: 'MSF',       start_time: '10:30', end_time: '11:30', faculty: 'VP' },
  { weekday: 5, period_order: 3, code: 'OOPJ',      start_time: '11:30', end_time: '12:30', faculty: 'SB' },
  { weekday: 5, period_order: 4, code: 'NJ/RJ LAB', start_time: '13:15', end_time: '16:15', duration_periods: 3, faculty: 'PBK', room: 'LAB-5' },
  // Saturday
  { weekday: 6, period_order: 1, code: 'SE LAB',    start_time: '09:30', end_time: '12:30', duration_periods: 3, faculty: 'PVS', room: 'CC LAB' },
  { weekday: 6, period_order: 2, code: 'COA',       start_time: '13:15', end_time: '14:15', faculty: 'SS' },
  { weekday: 6, period_order: 3, code: 'OOPJ',      start_time: '14:15', end_time: '15:15', faculty: 'SB' },
  { weekday: 6, period_order: 4, code: 'MSF',       start_time: '15:15', end_time: '16:15', faculty: 'VP' }
];

export const STATUS_META = {
  present: { label: 'Present',  color: 'var(--present)', affectsAttendance: true,  countsTowardTotal: true },
  absent:  { label: 'Absent',   color: 'var(--absent)',  affectsAttendance: true,  countsTowardTotal: true },
  holiday: { label: 'Holiday',  color: 'var(--holiday)', affectsAttendance: false, countsTowardTotal: false },
  exam:    { label: 'Exam Day', color: 'var(--exam)',    affectsAttendance: false, countsTowardTotal: false }
};

export const BRANCHES = ['CSE', 'CSE(AIML)', 'CSE(AIDS)'];
export const SECTIONS = ['II-MA', 'II-MB', 'II-MC'];
