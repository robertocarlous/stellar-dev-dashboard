/**
 * useSecurityDashboard — hook for security score, threats, and scanning.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  calculateSecurityScore,
  getThreatAlerts,
  getThreatSummary,
  resolveThreatAlert,
  startThreatMonitoring,
  scanInputForThreats,
  runClientVulnerabilityScan,
  subscribeThreatAlerts,
} from '../lib/security';
import type {
  SecurityScoreReport,
  ThreatAlert,
  VulnerabilityFinding,
} from '../lib/security/types';

export function useSecurityDashboard() {
  const [scoreReport, setScoreReport] = useState<SecurityScoreReport | null>(null);
  const [threats, setThreats] = useState<ThreatAlert[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<VulnerabilityFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanInput, setScanInput] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [report, vulns] = await Promise.all([
        calculateSecurityScore(),
        runClientVulnerabilityScan(),
      ]);
      setScoreReport(report);
      setVulnerabilities(vulns);
      setThreats(getThreatAlerts());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stopMonitoring = startThreatMonitoring();
    const unsub = subscribeThreatAlerts(setThreats);
    void refresh();

    return () => {
      stopMonitoring();
      unsub();
    };
  }, [refresh]);

  const resolveThreat = useCallback(
    async (id: string) => {
      resolveThreatAlert(id);
      setThreats(getThreatAlerts());
      await refresh();
    },
    [refresh]
  );

  const scanUserInput = useCallback(
    async (input: string) => {
      const detected = scanInputForThreats(input, 'user-input');
      setThreats(getThreatAlerts());
      await refresh();
      return detected;
    },
    [refresh]
  );

  return {
    scoreReport,
    threats,
    threatSummary: getThreatSummary(),
    vulnerabilities,
    loading,
    scanInput,
    setScanInput,
    refresh,
    resolveThreat,
    scanUserInput,
  };
}
