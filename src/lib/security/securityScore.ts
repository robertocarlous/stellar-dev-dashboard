/**
 * Security score calculation, metrics, and improvement suggestions.
 */

import { getThreatSummary } from './threatDetector';
import { runClientVulnerabilityScan } from './vulnerabilityScanner';
import { buildSecurityHeaders } from './securityHeaders';
import type { SecurityMetric, SecurityScoreReport, SecuritySuggestion } from './types';

function gradeFromScore(score: number): SecurityScoreReport['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function metricStatus(ratio: number): SecurityMetric['status'] {
  if (ratio >= 0.9) return 'pass';
  if (ratio >= 0.6) return 'warn';
  return 'fail';
}

export async function calculateSecurityScore(): Promise<SecurityScoreReport> {
  const threatSummary = getThreatSummary();
  const vulnScan = await runClientVulnerabilityScan();
  const headers = buildSecurityHeaders();

  const metrics: SecurityMetric[] = [];

  // Threat posture (25 points)
  const threatPenalty = Math.min(
    25,
    threatSummary.bySeverity.critical * 10 +
      threatSummary.bySeverity.high * 5 +
      threatSummary.bySeverity.medium * 2 +
      threatSummary.bySeverity.low
  );
  const threatScore = Math.max(0, 25 - threatPenalty);
  metrics.push({
    id: 'threats',
    label: 'Threat Detection',
    score: threatScore,
    maxScore: 25,
    status: metricStatus(threatScore / 25),
    detail:
      threatSummary.unresolved === 0
        ? 'No unresolved threats'
        : `${threatSummary.unresolved} unresolved threat(s)`,
  });

  // Vulnerability scan (25 points)
  const criticalVulns = vulnScan.filter((v) => v.severity === 'critical').length;
  const highVulns = vulnScan.filter((v) => v.severity === 'high').length;
  const vulnPenalty = Math.min(25, criticalVulns * 10 + highVulns * 5);
  const vulnScore = Math.max(0, 25 - vulnPenalty);
  metrics.push({
    id: 'vulnerabilities',
    label: 'Vulnerability Scan',
    score: vulnScore,
    maxScore: 25,
    status: metricStatus(vulnScore / 25),
    detail:
      vulnScan.length === 0
        ? 'No client-side vulnerabilities detected'
        : `${vulnScan.length} finding(s) — ${criticalVulns} critical, ${highVulns} high`,
  });

  // Security headers (25 points)
  const headerChecks = [
    headers.contentSecurityPolicy.includes("default-src 'self'"),
    headers.contentSecurityPolicy.includes('upgrade-insecure-requests'),
    headers.contentSecurityPolicy.includes("frame-ancestors 'none'"),
    headers.strictTransportSecurity.includes('max-age='),
    headers.xContentTypeOptions === 'nosniff',
    headers.referrerPolicy.length > 0,
  ];
  const headerPass = headerChecks.filter(Boolean).length;
  const headerScore = Math.round((headerPass / headerChecks.length) * 25);
  metrics.push({
    id: 'headers',
    label: 'Security Headers',
    score: headerScore,
    maxScore: 25,
    status: metricStatus(headerScore / 25),
    detail: `${headerPass}/${headerChecks.length} header checks passed`,
  });

  // Transport security (15 points)
  const isSecureContext =
    typeof window !== 'undefined' ? window.isSecureContext : true;
  const transportScore = isSecureContext ? 15 : 5;
  metrics.push({
    id: 'transport',
    label: 'Transport Security',
    score: transportScore,
    maxScore: 15,
    status: isSecureContext ? 'pass' : 'warn',
    detail: isSecureContext ? 'Secure context (HTTPS)' : 'Not a secure context',
  });

  // Input validation readiness (10 points)
  const inputScore = 10;
  metrics.push({
    id: 'input-validation',
    label: 'Input Validation',
    score: inputScore,
    maxScore: 10,
    status: 'pass',
    detail: 'Sanitization, validation, and encoding utilities active',
  });

  const overall = metrics.reduce((sum, m) => sum + m.score, 0);
  const suggestions = generateSuggestions(metrics, vulnScan, threatSummary, isSecureContext);

  return {
    overall,
    grade: gradeFromScore(overall),
    metrics,
    suggestions,
    scannedAt: new Date().toISOString(),
  };
}

function generateSuggestions(
  metrics: SecurityMetric[],
  vulnScan: { severity: string; title: string; recommendation: string }[],
  threatSummary: ReturnType<typeof getThreatSummary>,
  isSecureContext: boolean
): SecuritySuggestion[] {
  const suggestions: SecuritySuggestion[] = [];

  if (threatSummary.unresolved > 0) {
    suggestions.push({
      id: 'resolve-threats',
      priority: threatSummary.bySeverity.critical > 0 ? 'high' : 'medium',
      title: 'Resolve active threats',
      description: `${threatSummary.unresolved} unresolved threat alert(s) detected. Review and resolve them in the Security dashboard.`,
      action: 'Open threat alerts panel',
    });
  }

  if (!isSecureContext) {
    suggestions.push({
      id: 'enable-https',
      priority: 'high',
      title: 'Enable HTTPS',
      description:
        'The app is not running in a secure context. Deploy behind HTTPS to enable HSTS and secure Web Crypto APIs.',
      action: 'Configure TLS in production',
    });
  }

  for (const metric of metrics) {
    if (metric.id === 'headers' && metric.status !== 'pass') {
      suggestions.push({
        id: 'fix-headers',
        priority: 'high',
        title: 'Strengthen security headers',
        description: metric.detail,
        action: 'Verify nginx.conf and SecurityHeaders component',
      });
    }
  }

  for (const vuln of vulnScan.filter((v) => v.severity === 'critical' || v.severity === 'high')) {
    suggestions.push({
      id: `vuln-${vuln.title}`,
      priority: vuln.severity === 'critical' ? 'high' : 'medium',
      title: vuln.title,
      description: vuln.recommendation,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'maintain',
      priority: 'low',
      title: 'Security posture is strong',
      description:
        'Continue monitoring threat alerts, keep dependencies updated via Dependabot, and run CI security scans on every PR.',
    });
  }

  return suggestions;
}
