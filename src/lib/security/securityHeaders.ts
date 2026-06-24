/**
 * Centralized security header configuration — CSP, HSTS, and related headers.
 */

import { buildCspHeader, generateCspNonce } from '../../utils/security.js';

export interface SecurityHeaderSet {
  contentSecurityPolicy: string;
  strictTransportSecurity: string;
  xFrameOptions: string;
  xContentTypeOptions: string;
  referrerPolicy: string;
  permissionsPolicy: string;
  xXssProtection: string;
}

export const HSTS_MAX_AGE_SECONDS = 31_536_000; // 1 year
export const HSTS_HEADER = `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`;

/**
 * Build the full set of security headers for production/nginx.
 */
export function buildSecurityHeaders(nonce?: string): SecurityHeaderSet {
  const resolvedNonce = nonce ?? generateCspNonce();
  return {
    contentSecurityPolicy: buildCspHeader(resolvedNonce),
    strictTransportSecurity: HSTS_HEADER,
    xFrameOptions: 'SAMEORIGIN',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=(), payment=()',
    xXssProtection: '1; mode=block',
  };
}

/**
 * Convert header set to nginx add_header directives.
 */
export function toNginxHeaders(headers: SecurityHeaderSet): string[] {
  return [
    `add_header Strict-Transport-Security "${headers.strictTransportSecurity}" always;`,
    `add_header X-Frame-Options "${headers.xFrameOptions}" always;`,
    `add_header X-Content-Type-Options "${headers.xContentTypeOptions}" always;`,
    `add_header X-XSS-Protection "${headers.xXssProtection}" always;`,
    `add_header Referrer-Policy "${headers.referrerPolicy}" always;`,
    `add_header Permissions-Policy "${headers.permissionsPolicy}" always;`,
    `add_header Content-Security-Policy "${headers.contentSecurityPolicy}" always;`,
  ];
}

/**
 * Convert header set to a plain object for Vite dev-server headers.
 */
export function toDevServerHeaders(
  headers: SecurityHeaderSet
): Record<string, string> {
  return {
    'Content-Security-Policy': headers.contentSecurityPolicy,
    'X-Frame-Options': headers.xFrameOptions,
    'X-Content-Type-Options': headers.xContentTypeOptions,
    'Referrer-Policy': headers.referrerPolicy,
    'Permissions-Policy': headers.permissionsPolicy,
    'X-XSS-Protection': headers.xXssProtection,
    // HSTS only meaningful over HTTPS — omitted in local dev
  };
}

export { generateCspNonce, buildCspHeader };
