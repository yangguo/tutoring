"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAllChecks = exports.checkSupabaseQuery = exports.checkSupabaseReachable = exports.checkEnv = void 0;
const supabase_js_1 = require("../config/supabase.js");
const toBool = (v) => v !== undefined && v !== '' && v !== null;
const fetchWithTimeout = async (url, opts = {}, timeoutMs = 3000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        // Node 18+ global fetch
        const res = await fetch(url, { ...opts, signal: controller.signal });
        return res;
    }
    finally {
        clearTimeout(timeout);
    }
};
const checkEnv = async () => {
    const missing = [];
    const env = process.env;
    if (!toBool(env.SUPABASE_URL))
        missing.push('SUPABASE_URL');
    if (!toBool(env.SUPABASE_SERVICE_ROLE_KEY))
        missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!toBool(env.JWT_SECRET))
        missing.push('JWT_SECRET');
    const warnings = [];
    const url = env.SUPABASE_URL || '';
    if (url && !/^https:\/\/.+\.supabase\.co$/.test(url)) {
        warnings.push('SUPABASE_URL does not match https://<ref>.supabase.co');
    }
    return {
        ok: missing.length === 0,
        message: missing.length === 0 ? 'Environment looks good' : `Missing env: ${missing.join(', ')}`,
        details: { warnings }
    };
};
exports.checkEnv = checkEnv;
const checkSupabaseReachable = async () => {
    const base = process.env.SUPABASE_URL;
    if (!base)
        return { ok: false, message: 'SUPABASE_URL not set' };
    try {
        // Any response (even 404) proves connectivity and DNS/SSL are OK
        const res = await fetchWithTimeout(`${base}/rest/v1/`, { method: 'HEAD' }, 3000);
        return { ok: true, message: `Reachable (status ${res.status})` };
    }
    catch (e) {
        return { ok: false, message: `Fetch failed: ${e?.message || 'unknown error'}` };
    }
};
exports.checkSupabaseReachable = checkSupabaseReachable;
const checkSupabaseQuery = async () => {
    try {
        const start = Date.now();
        const { error } = await supabase_js_1.supabase.from('books').select('id', { count: 'exact', head: true }).limit(1);
        const ms = Date.now() - start;
        if (error) {
            return { ok: false, message: `Query error: ${error.message}`, details: { ms } };
        }
        return { ok: true, message: `Query ok (${ms}ms)` };
    }
    catch (e) {
        return { ok: false, message: `Query failed: ${e?.message || 'unknown error'}` };
    }
};
exports.checkSupabaseQuery = checkSupabaseQuery;
const runAllChecks = async () => {
    const env = await (0, exports.checkEnv)();
    const reach = await (0, exports.checkSupabaseReachable)();
    // Only attempt query if reachability looks ok
    const query = reach.ok ? await (0, exports.checkSupabaseQuery)() : { ok: false, message: 'Skipped (unreachable)' };
    const ok = env.ok && reach.ok && query.ok;
    return { ok, env, reach, query };
};
exports.runAllChecks = runAllChecks;
//# sourceMappingURL=health.js.map