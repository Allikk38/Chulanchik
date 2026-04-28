// ============================================================
// core/supabase-client.js
// ============================================================

/**
 * Единый экземпляр Supabase-клиента.
 * 
 * Создаётся один раз при первом импорте модуля.
 * Все остальные модули импортируют supabase отсюда.
 * 
 * @module supabase-client
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/** @type {string} */
export const SUPABASE_URL = 'https://bhdwniiyrrujeoubrvle.supabase.co';

/** @type {string} */
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoZHduaWl5cnJ1amVvdWJydmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MzM2MTYsImV4cCI6MjA5MjIwOTYxNn0.-EilGBYgNNRraTjEqilYuvk-Pfy_Mf5TNEtS1NrU2WM';

/**
 * Экземпляр Supabase-клиента — единственный на всё приложение.
 * 
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('[supabase-client] Client created');
