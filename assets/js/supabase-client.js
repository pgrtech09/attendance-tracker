// ==========================================================================
// Supabase client bootstrap
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY before deploying.
// These are safe to expose publicly — access is enforced by Row Level
// Security policies defined in supabase.sql, never by hiding this key.
// ==========================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://kmjvtwfcxnkpoqonbhsk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttanZ0d2ZjeG5rcG9xb25iaHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5Nzc3NDUsImV4cCI6MjA5OTU1Mzc0NX0.tXWotHslS3xas2fHnxDcN8CLknmgGy2u4gTu6d4hzYs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    storageKey: 'sat-auth-session'
  }
});

// Roll numbers double as the login identifier. Supabase Auth requires an
// email, so every student is registered under a synthetic, non-deliverable
// address derived from their roll number. Nobody ever sees or types this —
// the UI only ever asks for the roll number.
export function rollNumberToEmail(rollNumber) {
  return `${rollNumber.trim().toLowerCase()}@students.attendance.local`;
}

export function dobToPassword(dobISO) {
  // dobISO: 'YYYY-MM-DD' -> 'DDMMYYYY'
  const [y, m, d] = dobISO.split('-');
  return `${d}${m}${y}`;
}
