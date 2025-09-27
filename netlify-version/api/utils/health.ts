import { supabase } from '../config/supabase.js';

type CheckResult = {
  ok: boolean
  message: string
  details?: Record<string, any>
}

const toBool = (v: any) => v !== undefined && v !== '' && v !== null

const fetchWithTimeout = async (url: string, opts: RequestInit = {}, timeoutMs = 3000) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Node 18+ global fetch
    const res = await fetch(url, { ...opts, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timeout)
  }
}

export const checkEnv = async (): Promise<CheckResult> => {
  const missing: string[] = []
  const env = process.env
  if (!toBool(env.SUPABASE_URL)) missing.push('SUPABASE_URL')
  if (!toBool(env.SUPABASE_SERVICE_ROLE_KEY)) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!toBool(env.JWT_SECRET)) missing.push('JWT_SECRET')

  const warnings: string[] = []
  const url = env.SUPABASE_URL || ''
  if (url && !/^https:\/\/.+\.supabase\.co$/.test(url)) {
    warnings.push('SUPABASE_URL does not match https://<ref>.supabase.co')
  }

  return {
    ok: missing.length === 0,
    message: missing.length === 0 ? 'Environment looks good' : `Missing env: ${missing.join(', ')}`,
    details: { warnings }
  }
}

export const checkSupabaseReachable = async (): Promise<CheckResult> => {
  const base = process.env.SUPABASE_URL
  if (!base) return { ok: false, message: 'SUPABASE_URL not set' }
  try {
    // Any response (even 404) proves connectivity and DNS/SSL are OK
    const res = await fetchWithTimeout(`${base}/rest/v1/`, { method: 'HEAD' }, 3000)
    return { ok: true, message: `Reachable (status ${res.status})` }
  } catch (e: any) {
    return { ok: false, message: `Fetch failed: ${e?.message || 'unknown error'}` }
  }
}

export const checkSupabaseQuery = async (): Promise<CheckResult> => {
  try {
    const start = Date.now()
    const { error } = await supabase.from('books').select('id', { count: 'exact', head: true }).limit(1)
    const ms = Date.now() - start
    if (error) {
      return { ok: false, message: `Query error: ${error.message}`, details: { ms } }
    }
    return { ok: true, message: `Query ok (${ms}ms)` }
  } catch (e: any) {
    return { ok: false, message: `Query failed: ${e?.message || 'unknown error'}` }
  }
}

export const runAllChecks = async () => {
  const env = await checkEnv()
  const reach = await checkSupabaseReachable()
  // Only attempt query if reachability looks ok
  const query = reach.ok ? await checkSupabaseQuery() : { ok: false, message: 'Skipped (unreachable)' }
  const ok = env.ok && reach.ok && query.ok
  return { ok, env, reach, query }
}

