// src/lib/supabase.js

import { createClient } from '@supabase/supabase-js';

// ==========================================
// SUPABASE CONFIGURATION
// ==========================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL_AUTH;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY_AUTH;

// ==========================================
// DEBUG
// ==========================================

console.log('========================================');
console.log('SUPABASE CONFIG');
console.log('========================================');
console.log('SUPABASE URL:', supabaseUrl);
console.log('SUPABASE ANON KEY EXISTS:', !!supabaseAnonKey);
console.log('========================================');

const supabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey
);

export const supabaseAuth = supabaseClient;
export const supabaseData = supabaseClient;