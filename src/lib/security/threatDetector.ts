/**
 * Real-time threat detection and anomaly monitoring.
 */

import {
  subscribeSecurityAlerts,
  subscribeAudit,
  SecurityEventType,
} from '../securityEvents.js';
import { checkThreatIntelligence } from './threatIntelligence';
import { detectInjectionAttempt } from './inputValidator';
import type { ThreatAlert, ThreatCategory, ThreatSeverity } from './types';

const MAX_ALERTS = 100;
const alerts: ThreatAlert[] = [];
const subscribers = new Set<(alerts: ThreatAlert[]) => void>();

let monitoring = false;

const SEVERITY_ORDER: Record<ThreatSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const EVENT_TO_THREAT: Partial<
  Record<string, { category: ThreatCategory; severity: ThreatSeverity; title: string }>
> = {
  [SecurityEventType.CSP_VIOLATION]: {
    category: 'csp',
    severity: 'high',
    title: 'CSP Violation',
  },
  [SecurityEventType.XSS_ATTEMPT]: {
    category: 'xss',
    severity: 'critical',
    title: 'XSS Attempt Blocked',
  },
  [SecurityEventType.INTEGRITY_VIOLATION]: {
    category: 'integrity',
    severity: 'critical',
    title: 'Integrity Violation',
  },
  [SecurityEventType.RATE_LIMIT_HIT]: {
    category: 'anomaly',
    severity: 'medium',
    title: 'Rate Limit Exceeded',
  },
  [SecurityEventType.TX_SUSPICIOUS]: {
    category: 'anomaly',
    severity: 'high',
    title: 'Suspicious Transaction',
  },
  [SecurityEventType.AUTH_LOGIN_FAILED]: {
    category: 'anomaly',
    severity: 'medium',
    title: 'Failed Authentication',
  },
};

function generateId(): string {
  return `threat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emitAlerts(): void {
  const snapshot = [...alerts];
  for (const fn of subscribers) {
    try {
      fn(snapshot);
    } catch {
      /* swallow */
    }
  }
}

export function addThreatAlert(
  partial: Omit<ThreatAlert, 'id' | 'detectedAt' | 'resolved'>
): ThreatAlert {
  const alert: ThreatAlert = {
    ...partial,
    id: generateId(),
    detectedAt: new Date().toISOString(),
    resolved: false,
  };

  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;
  emitAlerts();

  return alert;
}

export function getThreatAlerts(includeResolved = false): ThreatAlert[] {
  return includeResolved ? [...alerts] : alerts.filter((a) => !a.resolved);
}

export function resolveThreatAlert(id: string): void {
  const alert = alerts.find((a) => a.id === id);
  if (alert) {
    alert.resolved = true;
    emitAlerts();
  }
}

export function subscribeThreatAlerts(handler: (alerts: ThreatAlert[]) => void): () => void {
  subscribers.add(handler);
  handler(getThreatAlerts());
  return () => subscribers.delete(handler);
}

function auditToThreat(entry: { action?: string; severity?: string; metadata?: Record<string, unknown> }): void {
  const mapping = EVENT_TO_THREAT[entry.action ?? ''];
  if (!mapping) return;

  addThreatAlert({
    category: mapping.category,
    severity: mapping.severity,
    title: mapping.title,
    description: `Security event: ${entry.action}`,
    source: 'audit-trail',
    metadata: entry.metadata,
  });
}

function anomalyToThreat(alert: { kind: string; [key: string]: unknown }): void {
  const titles: Record<string, string> = {
    brute_force_suspected: 'Brute Force Attack Suspected',
    rate_limit_storm: 'Rate Limit Storm Detected',
  };

  addThreatAlert({
    category: 'anomaly',
    severity: alert.kind === 'brute_force_suspected' ? 'critical' : 'high',
    title: titles[alert.kind] ?? 'Anomaly Detected',
    description: `Anomaly kind: ${alert.kind}`,
    source: 'anomaly-detector',
    metadata: alert,
  });
}

/**
 * Scan user input against threat intelligence and injection patterns.
 */
export function scanInputForThreats(input: string, source: string): ThreatAlert[] {
  const detected: ThreatAlert[] = [];

  for (const match of checkThreatIntelligence(input)) {
    detected.push(
      addThreatAlert({
        category: match.category,
        severity: match.severity,
        title: 'Threat Intelligence Match',
        description: match.description,
        source,
        metadata: { pattern: match.pattern },
      })
    );
  }

  const injections = detectInjectionAttempt(input);
  for (const desc of injections) {
    detected.push(
      addThreatAlert({
        category: 'injection',
        severity: 'high',
        title: 'Injection Attempt',
        description: desc,
        source,
      })
    );
  }

  return detected;
}

export function startThreatMonitoring(): () => void {
  if (monitoring) return () => {};
  monitoring = true;

  const unsubAlerts = subscribeSecurityAlerts(anomalyToThreat);
  const unsubAudit = subscribeAudit((entry) => {
    if (EVENT_TO_THREAT[entry.action ?? '']) {
      auditToThreat(entry);
    }
  });

  return () => {
    monitoring = false;
    unsubAlerts();
    unsubAudit();
  };
}

export function getThreatSummary(): {
  total: number;
  unresolved: number;
  bySeverity: Record<ThreatSeverity, number>;
  highestSeverity: ThreatSeverity | null;
} {
  const unresolved = alerts.filter((a) => !a.resolved);
  const bySeverity: Record<ThreatSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const alert of unresolved) {
    bySeverity[alert.severity] += 1;
  }

  let highestSeverity: ThreatSeverity | null = null;
  for (const sev of ['critical', 'high', 'medium', 'low'] as ThreatSeverity[]) {
    if (bySeverity[sev] > 0) {
      highestSeverity = sev;
      break;
    }
  }

  return {
    total: alerts.length,
    unresolved: unresolved.length,
    bySeverity,
    highestSeverity,
  };
}

export function compareSeverity(a: ThreatSeverity, b: ThreatSeverity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}
