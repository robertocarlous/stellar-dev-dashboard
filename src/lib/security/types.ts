/** Advanced security type definitions. */

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ThreatCategory =
  | 'xss'
  | 'injection'
  | 'phishing'
  | 'anomaly'
  | 'csp'
  | 'integrity'
  | 'exfiltration';

export interface ThreatAlert {
  id: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  title: string;
  description: string;
  detectedAt: string;
  source: string;
  metadata?: Record<string, unknown>;
  resolved?: boolean;
}

export interface ThreatIntelligenceMatch {
  pattern: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  description: string;
}

export interface SecurityMetric {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface SecurityScoreReport {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  metrics: SecurityMetric[];
  suggestions: SecuritySuggestion[];
  scannedAt: string;
}

export interface SecuritySuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action?: string;
}

export interface VulnerabilityFinding {
  id: string;
  severity: ThreatSeverity;
  title: string;
  location: string;
  recommendation: string;
}

export interface ValidationResult {
  valid: boolean;
  sanitized: string;
  errors: string[];
}
