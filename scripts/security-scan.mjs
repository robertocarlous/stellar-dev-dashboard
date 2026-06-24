#!/usr/bin/env node
/**
 * Custom security scanner for CI and local use.
 * Validates security headers, module presence, and secret patterns.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const secretsOnly = process.argv.includes('--secrets-only');
const findings = [];
let exitCode = 0;

function fail(id, title, location, recommendation) {
  findings.push({ id, severity: 'high', title, location, recommendation });
  exitCode = 1;
}

function warn(id, title, location, recommendation) {
  findings.push({ id, severity: 'medium', title, location, recommendation });
}

function pass(id, title) {
  findings.push({ id, severity: 'info', title, location: 'ok', recommendation: 'Passed' });
}

// ── Secret pattern scan ──────────────────────────────────────────────────────
const SECRET_PATTERNS = [
  { name: 'private-key', pattern: /BEGIN (RSA |EC )?PRIVATE KEY/ },
  { name: 'github-token', pattern: /ghp_[0-9a-zA-Z]{36}/ },
  { name: 'aws-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'stellar-secret', pattern: /\bS[A-Z2-7]{55}\b/ },
];

function scanSecrets() {
  let output;
  try {
    output = execSync(
      'git grep -E "BEGIN (RSA |EC )?PRIVATE KEY|ghp_[0-9a-zA-Z]{36}|AKIA[0-9A-Z]{16}" -- ":!node_modules" ":!package-lock.json" ":!pnpm-lock.yaml" 2>/dev/null || true',
      { encoding: 'utf8' }
    );
  } catch {
    output = '';
  }

  if (output.trim()) {
    fail('hardcoded-secrets', 'Potential hardcoded secrets detected', 'git grep', 'Remove secrets from source code');
  } else {
    pass('secret-scan', 'No hardcoded secret patterns found');
  }
}

if (secretsOnly) {
  scanSecrets();
  writeFileSync('security-scan-report.json', JSON.stringify({ findings, scannedAt: new Date().toISOString() }, null, 2));
  process.exit(exitCode);
}

// ── Security module checks ───────────────────────────────────────────────────
const REQUIRED_MODULES = [
  'src/lib/security/threatDetector.ts',
  'src/lib/security/securityScore.ts',
  'src/lib/security/inputValidator.ts',
  'src/lib/security/securityHeaders.ts',
  'src/lib/security/vulnerabilityScanner.ts',
  'src/lib/security/threatIntelligence.ts',
  'src/components/dashboard/SecurityDashboard.tsx',
];

for (const mod of REQUIRED_MODULES) {
  if (!existsSync(mod)) {
    fail('missing-module', `Missing security module: ${mod}`, mod, 'Ensure all security modules are present');
  } else {
    pass(`module-${mod}`, `Module present: ${mod}`);
  }
}

// ── nginx.conf header checks ─────────────────────────────────────────────────
if (existsSync('nginx.conf')) {
  const nginx = readFileSync('nginx.conf', 'utf8');
  const requiredHeaders = [
    'Strict-Transport-Security',
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'frame-ancestors',
    'upgrade-insecure-requests',
    "object-src 'none'",
  ];

  for (const header of requiredHeaders) {
    if (!nginx.includes(header)) {
      fail('nginx-header', `Missing nginx security header: ${header}`, 'nginx.conf', `Add ${header} to nginx.conf`);
    }
  }

  if (nginx.includes('Strict-Transport-Security') && nginx.includes('includeSubDomains')) {
    pass('hsts', 'HSTS configured with includeSubDomains');
  }
} else {
  warn('no-nginx', 'nginx.conf not found', 'root', 'Add nginx.conf for production deployments');
}

// ── Workflow checks ──────────────────────────────────────────────────────────
if (!existsSync('.github/workflows/security.yml')) {
  fail('missing-workflow', 'security.yml workflow missing', '.github/workflows/', 'Add security scanning workflow');
} else {
  pass('security-workflow', 'Security workflow present');
}

if (!existsSync('.github/dependabot.yml')) {
  warn('no-dependabot', 'dependabot.yml not found', '.github/', 'Configure Dependabot for automated updates');
}

// ── Secret scan ──────────────────────────────────────────────────────────────
scanSecrets();

// ── Report ───────────────────────────────────────────────────────────────────
const report = {
  scannedAt: new Date().toISOString(),
  totalFindings: findings.length,
  failures: findings.filter((f) => f.severity === 'high').length,
  warnings: findings.filter((f) => f.severity === 'medium').length,
  findings,
};

writeFileSync('security-scan-report.json', JSON.stringify(report, null, 2));

console.log(`Security scan complete: ${report.failures} failure(s), ${report.warnings} warning(s)`);

if (report.failures > 0) {
  for (const f of findings.filter((x) => x.severity === 'high')) {
    console.error(`  FAIL: ${f.title} — ${f.location}`);
  }
}

process.exit(exitCode);
