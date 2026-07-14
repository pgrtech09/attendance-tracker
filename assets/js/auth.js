import { supabase, rollNumberToEmail, dobToPassword } from './supabase-client.js';
import { SUBJECTS, DEFAULT_TIMETABLE } from './reference-data.js';

const REMEMBER_KEY = 'sat_remember_roll';

export async function registerStudent({ fullName, rollNumber, dob, branch, section, year, semester }) {
  const email = rollNumberToEmail(rollNumber);
  const password = dobToPassword(dob);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, roll_number: rollNumber.trim().toUpperCase() }
    }
  });
  if (signUpError) throw new Error(mapAuthError(signUpError));

  const userId = signUpData.user?.id;
  if (!userId) throw new Error('Registration did not return a user. Please try logging in.');

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    full_name: fullName,
    roll_number: rollNumber.trim().toUpperCase(),
    dob,
    branch,
    section,
    year,
    semester
  });
  if (profileError) throw new Error(mapDbError(profileError));

  await seedDefaultsForUser(userId);
  return { userId, generatedPassword: password };
}

export async function loginWithRollNumber(rollNumber, password, remember) {
  const email = rollNumberToEmail(rollNumber);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(mapAuthError(error));

  if (remember) {
    localStorage.setItem(REMEMBER_KEY, rollNumber.trim().toUpperCase());
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
  return data;
}

export function getRememberedRoll() {
  return localStorage.getItem(REMEMBER_KEY) || '';
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

export async function requireSession() {
  const session = await getPersistedSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

export async function redirectIfLoggedIn() {
  const session = await getPersistedSession();
  if (session) window.location.href = 'dashboard.html';
}

// Reads the locally stored session. If it looks expired or missing on the
// first check, explicitly attempts a token refresh before giving up — this
// covers the case where the app was closed for a while and the access token
// expired, but the long-lived refresh token stored on-device is still valid.
// Only signs the user out for real if that refresh attempt also fails.
async function getPersistedSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.session || null;
}

// Seeds each new student's private subject-attendance rows, default
// timetable, semester settings and notification preferences so every
// downstream screen has data to read on first login.
async function seedDefaultsForUser(userId) {
  const { data: subjectRows, error: subErr } = await supabase.from('subjects').select('id, code');
  if (subErr) throw new Error(mapDbError(subErr));

  let subjects = subjectRows;
  if (!subjects || subjects.length === 0) {
    const { data: inserted, error: insErr } = await supabase
      .from('subjects')
      .insert(SUBJECTS.map(s => ({ code: s.code, name: s.name, type: s.type })))
      .select('id, code');
    if (insErr) throw new Error(mapDbError(insErr));
    subjects = inserted;
  }
  const codeToId = Object.fromEntries(subjects.map(s => [s.code, s.id]));

  const timetableRows = DEFAULT_TIMETABLE
    .filter(row => codeToId[row.code])
    .map(row => ({
      user_id: userId,
      weekday: row.weekday,
      period_order: row.period_order,
      subject_id: codeToId[row.code],
      start_time: row.start_time,
      end_time: row.end_time,
      duration_periods: row.duration_periods || 1,
      faculty: row.faculty || null,
      room: row.room || null
    }));
  if (timetableRows.length) {
    const { error: ttErr } = await supabase.from('timetable').insert(timetableRows);
    if (ttErr) throw new Error(mapDbError(ttErr));
  }

  const today = new Date();
  const semStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const semEnd = new Date(today.getFullYear(), today.getMonth() + 4, 0);
  const { error: settingsErr } = await supabase.from('semester_settings').insert({
    user_id: userId,
    start_date: semStart.toISOString().slice(0, 10),
    end_date: semEnd.toISOString().slice(0, 10),
    target_percentage: 75
  });
  if (settingsErr) throw new Error(mapDbError(settingsErr));

  const { error: prefErr } = await supabase.from('user_settings').insert({
    user_id: userId,
    theme: 'light',
    morning_reminder_time: '08:30',
    evening_reminder_time: '18:00',
    notifications_enabled: true
  });
  if (prefErr) throw new Error(mapDbError(prefErr));
}

function mapAuthError(error) {
  const msg = error.message || '';
  if (msg.includes('already registered') || msg.includes('already exists')) {
    return 'This roll number is already registered. Please log in instead.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'Roll number or password is incorrect. Password is your DOB as DDMMYYYY.';
  }
  if (msg.includes('Password should be')) {
    return 'Date of birth is too short to form a valid password. Please check the date.';
  }
  return msg || 'Something went wrong. Please try again.';
}

function mapDbError(error) {
  if (error.code === '23505') return 'This roll number is already registered.';
  return error.message || 'Database error. Please try again.';
}
