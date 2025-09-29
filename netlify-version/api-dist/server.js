"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * local server entry file, for local development
 */
const app_js_1 = __importDefault(require("./app.js"));
const health_js_1 = require("./utils/health.js");
/**
 * start server with port
 */
const PORT = process.env.PORT || 3002;
const server = app_js_1.default.listen(PORT, () => {
    console.log(`Server ready on port ${PORT}`);
    // Run basic startup checks (non-blocking)
    (async () => {
        try {
            const checks = await (0, health_js_1.runAllChecks)();
            const status = checks.ok ? 'OK' : 'ISSUES FOUND';
            console.log(`[startup-checks] ${status}`);
            if (!checks.env.ok)
                console.warn('[env]', checks.env.message);
            if (!checks.reach.ok)
                console.warn('[supabase-reachability]', checks.reach.message);
            if (!checks.query.ok)
                console.warn('[supabase-query]', checks.query.message);
        }
        catch (e) {
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
exports.default = app_js_1.default;
//# sourceMappingURL=server.js.map