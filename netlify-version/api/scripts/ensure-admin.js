/**
 * Ensure an admin account exists and is correctly set in the users table.
 * Usage:
 *   npm run ensure:admin -- --email admin@example.com --password password123 --name "Admin User"
 * Or via env:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npm run ensure:admin
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('[ensure-admin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const args = process.argv.slice(2);
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      const key = token.slice(2, eq);
      const val = token.slice(eq + 1);
      out[key] = val;
    } else {
      const key = token.slice(2);
      const vals = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        vals.push(argv[++i]);
      }
      out[key] = vals.length ? vals.join(' ') : 'true';
    }
  }
  return out;
}
const argMap = parseArgs(args);

const ADMIN_EMAIL = argMap.email || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = argMap.password || process.env.ADMIN_PASSWORD || 'password123';
const ADMIN_NAME = argMap.name || process.env.ADMIN_NAME || 'Admin User';

if (!ADMIN_EMAIL) {
  console.error('[ensure-admin] Provide --email=<value> or --email <value>, or set ADMIN_EMAIL env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function ensureAuthUser(email, password) {
  // Try to find existing auth user by listing users (paginate up to a reasonable number)
  // Note: Admin API does not support direct search by email; we paginate and filter.
  try {
    let page = 1;
    let found = null;
    while (page <= 5 && !found) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (data.users.length < 100) break;
      page++;
    }
    if (found) return found;
  } catch (e) {
    console.warn('[ensure-admin] listUsers failed, will try createUser:', e.message || e);
  }

  // Create user if not found
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function ensureAdminProfile(user) {
  // Upsert into users table with role 'admin'
  const { data: existing } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (!existing) {
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email: ADMIN_EMAIL,
        full_name: ADMIN_NAME,
        role: 'admin',
        parent_id: null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  if (existing.role !== 'admin') {
    const { data, error } = await supabase
      .from('users')
      .update({ role: 'admin' })
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return existing;
}

async function main() {
  console.log(`[ensure-admin] Ensuring admin: ${ADMIN_EMAIL}`);
  const authUser = await ensureAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('[ensure-admin] Auth user id:', authUser.id);
  const profile = await ensureAdminProfile(authUser);
  console.log('[ensure-admin] Users table role:', profile.role);
  console.log('[ensure-admin] Done. You can now log in as admin.');
}

main().catch((e) => {
  console.error('[ensure-admin] Failed:', e.message || e);
  process.exit(1);
});
