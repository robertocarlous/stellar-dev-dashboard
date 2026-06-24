/**
 * Threat intelligence — known-bad patterns and domain blocklists.
 */

import type { ThreatCategory, ThreatIntelligenceMatch, ThreatSeverity } from './types';

const PHISHING_DOMAINS = [
  'stelllar.org',
  'stellar-wallet.com',
  'freighter-app.com',
  'stellar-claim.com',
];

const SUSPICIOUS_URL_PATTERNS: Array<{
  pattern: RegExp;
  category: ThreatCategory;
  severity: ThreatSeverity;
  description: string;
}> = [
  {
    pattern: /stelllar|stel+ar|freigh+ter/i,
    category: 'phishing',
    severity: 'high',
    description: 'Possible typosquatting domain detected',
  },
  {
    pattern: /<script|javascript:|onerror=|onload=/i,
    category: 'xss',
    severity: 'critical',
    description: 'Script injection pattern detected',
  },
  {
    pattern: /\beval\s*\(/i,
    category: 'injection',
    severity: 'high',
    description: 'Dynamic code execution pattern detected',
  },
  {
    pattern: /document\.cookie/i,
    category: 'exfiltration',
    severity: 'medium',
    description: 'Cookie access pattern detected',
  },
  {
    pattern: /\.\.\/|\.\.\\|%2e%2e/i,
    category: 'injection',
    severity: 'medium',
    description: 'Path traversal pattern detected',
  },
];

export function checkThreatIntelligence(input: string): ThreatIntelligenceMatch[] {
  if (!input || typeof input !== 'string') return [];

  const matches: ThreatIntelligenceMatch[] = [];

  for (const domain of PHISHING_DOMAINS) {
    if (input.toLowerCase().includes(domain)) {
      matches.push({
        pattern: domain,
        category: 'phishing',
        severity: 'critical',
        description: `Known phishing domain: ${domain}`,
      });
    }
  }

  for (const rule of SUSPICIOUS_URL_PATTERNS) {
    if (rule.pattern.test(input)) {
      matches.push({
        pattern: rule.pattern.source,
        category: rule.category,
        severity: rule.severity,
        description: rule.description,
      });
    }
  }

  return matches;
}

export function isSuspiciousUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return PHISHING_DOMAINS.some((d) => host.includes(d.replace('.com', '').replace('.org', '')))
      || SUSPICIOUS_URL_PATTERNS.some((r) => r.pattern.test(url));
  } catch {
    return SUSPICIOUS_URL_PATTERNS.some((r) => r.pattern.test(url));
  }
}
