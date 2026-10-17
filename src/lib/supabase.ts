import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// The anon key is public by design; Row Level Security and the SQL functions are what protect the data.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing');

// Turn Postgres / PostgREST errors into sentences a person can act on.
export function friendlyError(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return 'Something went wrong. Try again.';
  if (e.code === '42501' || /permission denied|not allowed/i.test(e.message ?? '')) return e.message?.includes('role') ? e.message : 'Your role is not allowed to do this.';
  if (/case_events_text_check/.test(e.message ?? '')) return 'Remove the ID number from the note.';
  if (/Failed to fetch/i.test(e.message ?? '')) return "Can't reach the database. Check your connection.";
  return e.message ?? 'Something went wrong. Try again.';
}
