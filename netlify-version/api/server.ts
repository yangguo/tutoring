/**
 * local server entry file, for local development
 */
import app from './app.js';
import { runAllChecks } from './utils/health.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3002;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  // Run basic startup checks (non-blocking)
  (async () => {
    try {
      const checks = await runAllChecks();
      const status = checks.ok ? 'OK' : 'ISSUES FOUND';
      console.log(`[startup-checks] ${status}`);
      if (!checks.env.ok) console.warn('[env]', checks.env.message);
      if (!checks.reach.ok) console.warn('[supabase-reachability]', checks.reach.message);
      if (!checks.query.ok) console.warn('[supabase-query]', checks.query.message);
    } catch (e: any) {
      console.warn('[startup-checks] failed to run:', e?.message || e);
    }
  })();
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;

