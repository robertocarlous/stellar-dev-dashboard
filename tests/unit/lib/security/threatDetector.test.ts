import { describe, it, expect, beforeEach } from 'vitest';
import {
  addThreatAlert,
  getThreatAlerts,
  resolveThreatAlert,
  getThreatSummary,
  scanInputForThreats,
} from '../../../../src/lib/security/threatDetector';

describe('threatDetector', () => {
  beforeEach(() => {
    const alerts = getThreatAlerts(true);
    alerts.forEach((a) => resolveThreatAlert(a.id));
  });

  it('creates and retrieves threat alerts', () => {
    addThreatAlert({
      category: 'xss',
      severity: 'high',
      title: 'Test Threat',
      description: 'Test description',
      source: 'test',
    });

    const active = getThreatAlerts();
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active[0].title).toBe('Test Threat');
  });

  it('resolves threat alerts', () => {
    const alert = addThreatAlert({
      category: 'anomaly',
      severity: 'medium',
      title: 'Resolvable',
      description: 'To resolve',
      source: 'test',
    });

    resolveThreatAlert(alert.id);
    expect(getThreatAlerts().find((a) => a.id === alert.id)).toBeUndefined();
  });

  it('scans input for threats', () => {
    const detected = scanInputForThreats('<script>evil()</script>', 'test');
    expect(detected.length).toBeGreaterThan(0);
  });

  it('returns threat summary', () => {
    const summary = getThreatSummary();
    expect(summary).toHaveProperty('unresolved');
    expect(summary).toHaveProperty('bySeverity');
  });
});
