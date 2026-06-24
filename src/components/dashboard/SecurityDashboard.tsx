import React, { useState } from 'react';
import { useSecurityDashboard } from '../../hooks/useSecurityDashboard';
import { validateAndSanitizeInput } from '../../lib/security/inputValidator';
import type { ThreatSeverity } from '../../lib/security/types';

function severityColor(severity: ThreatSeverity): string {
  const map: Record<ThreatSeverity, string> = {
    low: 'var(--text-muted)',
    medium: 'var(--yellow, #eab308)',
    high: 'var(--red)',
    critical: 'var(--red)',
  };
  return map[severity];
}

function gradeColor(grade: string): string {
  if (grade === 'A') return 'var(--green)';
  if (grade === 'B') return 'var(--cyan)';
  if (grade === 'C') return 'var(--yellow, #eab308)';
  return 'var(--red)';
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '13px',
        }}
      >
        {title}
      </div>
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  );
}

export default function SecurityDashboard() {
  const {
    scoreReport,
    threats,
    threatSummary,
    vulnerabilities,
    loading,
    scanInput,
    setScanInput,
    refresh,
    resolveThreat,
    scanUserInput,
  } = useSecurityDashboard();

  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);

  const handleScanInput = async () => {
    if (!scanInput.trim()) return;
    const validation = validateAndSanitizeInput(scanInput, 'text');
    setValidationResult({ valid: validation.valid, errors: validation.errors });
    await scanUserInput(scanInput);
  };

  if (loading && !scoreReport) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
        Running security scan…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px' }}>
      {/* Security Score */}
      {scoreReport && (
        <Card title="Security Score">
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                border: `3px solid ${gradeColor(scoreReport.grade)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: 700,
                color: gradeColor(scoreReport.grade),
              }}
              aria-label={`Security grade ${scoreReport.grade}`}
            >
              {scoreReport.grade}
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{scoreReport.overall}/100</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Scanned {new Date(scoreReport.scannedAt).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              style={{
                marginLeft: 'auto',
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ↻ Rescan
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
            }}
          >
            {scoreReport.metrics.map((metric) => (
              <div
                key={metric.id}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{metric.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                  {metric.score}/{metric.maxScore}
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '10px',
                      color:
                        metric.status === 'pass'
                          ? 'var(--green)'
                          : metric.status === 'warn'
                            ? 'var(--yellow, #eab308)'
                            : 'var(--red)',
                    }}
                  >
                    {metric.status}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {metric.detail}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Improvement Suggestions */}
      {scoreReport && scoreReport.suggestions.length > 0 && (
        <Card title="Improvement Suggestions">
          {scoreReport.suggestions.map((s) => (
            <div
              key={s.id}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background:
                      s.priority === 'high' ? 'var(--red-glow)' : 'var(--bg-card)',
                    color: s.priority === 'high' ? 'var(--red)' : 'var(--text-muted)',
                  }}
                >
                  {s.priority}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{s.title}</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                {s.description}
              </p>
            </div>
          ))}
        </Card>
      )}

      {/* Threat Alerts */}
      <Card title={`Threat Alerts (${threatSummary.unresolved} active)`}>
        {threats.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            No threats detected. Real-time monitoring is active.
          </p>
        ) : (
          threats.slice(0, 20).map((threat) => (
            <div
              key={threat.id}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: `1px solid ${threat.resolved ? 'var(--border)' : severityColor(threat.severity)}`,
                opacity: threat.resolved ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: severityColor(threat.severity) }}>
                    [{threat.severity.toUpperCase()}] {threat.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {threat.description} · {threat.category} · {threat.source}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(threat.detectedAt).toLocaleString()}
                  </div>
                </div>
                {!threat.resolved && (
                  <button
                    type="button"
                    onClick={() => void resolveThreat(threat.id)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card)',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Input Scanner */}
      <Card title="Input Threat Scanner">
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Test input against XSS, injection, and threat intelligence patterns.
        </p>
        <textarea
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          placeholder="Paste URL or text to scan…"
          rows={3}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            resize: 'vertical',
          }}
          aria-label="Text to scan for security threats"
        />
        <button
          type="button"
          onClick={() => void handleScanInput()}
          style={{
            alignSelf: 'flex-start',
            padding: '9px 18px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--cyan)',
            color: '#000',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Scan Input
        </button>
        {validationResult && (
          <div
            role="alert"
            style={{
              fontSize: '12px',
              color: validationResult.valid ? 'var(--green)' : 'var(--red)',
            }}
          >
            {validationResult.valid
              ? 'Input passed validation checks.'
              : validationResult.errors.join(' ')}
          </div>
        )}
      </Card>

      {/* Vulnerability Findings */}
      <Card title={`Vulnerability Scan (${vulnerabilities.length} findings)`}>
        {vulnerabilities.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--green)', margin: 0 }}>
            No client-side vulnerabilities detected.
          </p>
        ) : (
          vulnerabilities.map((v) => (
            <div
              key={v.id}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: severityColor(v.severity) }}>
                [{v.severity}] {v.title}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {v.location}
              </div>
              <div style={{ fontSize: '11px', marginTop: '4px' }}>{v.recommendation}</div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
