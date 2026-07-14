// ==========================================================================
// Supabase client bootstrap
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY before deploying.
// These are safe to expose publicly — access is enforced by Row Level
// Security policies defined in supabase.sql, never by hiding this key.
// ==========================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';

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
