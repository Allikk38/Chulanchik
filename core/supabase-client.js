// ========================================
// ФАЙЛ: core/supabase-client.js
// ========================================

/**
 * Supabase Client — единый клиент для всего приложения
 * 
 * Использует официальный SDK через ES-модули (CDN).
 * Создаётся один раз при импорте.
 * 
 * @module core/supabase-client
 * @version 3.0.0
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://bhdwniiyrrujeoubrvle.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoZHduaWl5cnJ1amVvdWJydmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MzM2MTYsImV4cCI6MjA5MjIwOTYxNn0.-EilGBYgNNRraTjEqilYuvk-Pfy_Mf5TNEtS1NrU2WM';

/**
 * Единый экземпляр Supabase-клиента.
 * Все модули импортируют supabase только отсюда.
 * 
 * @type {Object}
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('[Supabase] Client created (ES modules)');
