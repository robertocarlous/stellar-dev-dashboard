import { describe, it, expect } from 'vitest';
import {
  validateAndSanitizeInput,
  validatePublicKey,
  detectInjectionAttempt,
  encodeForHtmlAttribute,
} from '../../../../src/lib/security/inputValidator';
import { checkThreatIntelligence, isSuspiciousUrl } from '../../../../src/lib/security/threatIntelligence';
import { buildSecurityHeaders } from '../../../../src/lib/security/securityHeaders';

describe('inputValidator', () => {
  it('detects XSS patterns', () => {
    const threats = detectInjectionAttempt('<script>alert(1)</script>');
    expect(threats.length).toBeGreaterThan(0);
  });

  it('sanitizes text input', () => {
    const result = validateAndSanitizeInput('<b>hello</b>', 'text');
    expect(result.sanitized).not.toContain('<b>');
  });

  it('validates Stellar public keys', () => {
    expect(validatePublicKey('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF')).toBe(true);
    expect(validatePublicKey('invalid')).toBe(false);
  });

  it('encodes HTML attributes', () => {
    expect(encodeForHtmlAttribute('"><script>')).not.toContain('<');
  });
});

describe('threatIntelligence', () => {
  it('flags known phishing domains', () => {
    const matches = checkThreatIntelligence('https://stelllar.org/wallet');
    expect(matches.some((m) => m.category === 'phishing')).toBe(true);
  });

  it('detects suspicious URLs', () => {
    expect(isSuspiciousUrl('javascript:alert(1)')).toBe(true);
  });
});

describe('securityHeaders', () => {
  it('builds complete header set with HSTS', () => {
    const headers = buildSecurityHeaders();
    expect(headers.strictTransportSecurity).toContain('max-age=');
    expect(headers.strictTransportSecurity).toContain('includeSubDomains');
    expect(headers.contentSecurityPolicy).toContain("default-src 'self'");
    expect(headers.contentSecurityPolicy).toContain('upgrade-insecure-requests');
    expect(headers.xFrameOptions).toBe('SAMEORIGIN');
  });
});
