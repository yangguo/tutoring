#!/usr/bin/env node

import process from 'node:process';

const baseURL = process.env.API_BASE_URL || process.argv[2] || 'http://localhost:3002';
const endpoint = `${baseURL.replace(/\/$/, '')}/api/auth/login`;

const demoUsers = [
  { label: 'child', email: process.env.DEMO_CHILD_EMAIL || 'child@demo.com' },
  { label: 'parent', email: process.env.DEMO_PARENT_EMAIL || 'parent@demo.com' },
  { label: 'admin', email: process.env.DEMO_ADMIN_EMAIL || 'admin@demo.com' }
];

const password = process.env.DEMO_PASSWORD || 'password123';

const pad = (value, width) => value.toString().padEnd(width, ' ');

async function login(email) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const payload = await response.json().catch(() => ({ error: 'Invalid JSON response' }));

  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function main() {
  console.log(`\nTesting demo logins against ${endpoint}`);
  console.log(pad('Account', 10), pad('Email', 24), pad('Role', 10), 'Result');
  console.log('-'.repeat(60));

  const results = [];

  for (const { label, email } of demoUsers) {
    try {
      const { user, token } = await login(email);
      const maskedToken = typeof token === 'string' && token.length > 16
        ? `${token.slice(0, 8)}...${token.slice(-8)}`
        : token ? 'token issued' : 'missing';

      const role = user?.role || 'unknown';
      console.log(pad(label, 10), pad(email, 24), pad(role, 10), 'OK', maskedToken ? `(${maskedToken})` : '');
      results.push({ label, ok: true, role });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(pad(label, 10), pad(email, 24), pad('n/a', 10), `FAIL: ${message}`);
      results.push({ label, ok: false, message });
    }
  }

  const failed = results.filter((result) => !result.ok);

  console.log('\nSummary:');
  if (failed.length === 0) {
    console.log('All demo accounts authenticated successfully.');
    process.exit(0);
  } else {
    failed.forEach(({ label, message }) => {
      console.log(`- ${label} login failed: ${message}`);
    });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected failure while testing demo logins:', error);
  process.exit(1);
});
