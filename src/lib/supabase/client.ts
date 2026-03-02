import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase variables are missing from .env.local');
}

// Client for Browser-side code (using Anon Key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
