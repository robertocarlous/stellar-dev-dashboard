/**
 * Input validation, sanitization, and encoding utilities.
 */

import {
  escapeHtml,
  stripHtml,
  sanitizeStellarAddress,
  sanitizeMemo,
  redactSensitive,
} from '../../utils/security.js';
import type { ValidationResult } from './types';

const XSS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:text\/html/i,
  /&#x?[0-9a-f]+;/i,
];

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/i,
  /(--|;|\/\*|\*\/)/,
];

const PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;
const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;
const MEMO_ID_REGEX = /^\d+$/;

export function detectInjectionAttempt(input: string): string[] {
  const threats: string[] = [];
  if (!input || typeof input !== 'string') return threats;

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) threats.push('Potential XSS pattern detected');
  }
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) threats.push('Potential injection pattern detected');
  }
  return [...new Set(threats)];
}

export function validateAndSanitizeInput(
  input: string,
  type: 'text' | 'stellarAddress' | 'memo' | 'url' | 'xdr' = 'text'
): ValidationResult {
  const errors: string[] = [];
  let sanitized = typeof input === 'string' ? input : '';

  const injectionErrors = detectInjectionAttempt(sanitized);
  errors.push(...injectionErrors);

  switch (type) {
    case 'stellarAddress':
      sanitized = sanitizeStellarAddress(sanitized);
      if (sanitized && !PUBLIC_KEY_REGEX.test(sanitized)) {
        errors.push('Invalid Stellar public key format.');
      }
      break;
    case 'memo':
      sanitized = sanitizeMemo(sanitized);
      break;
    case 'url':
      sanitized = encodeForUrl(sanitized);
      try {
        const url = new URL(sanitized);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('URL must use http or https protocol.');
        }
      } catch {
        errors.push('Invalid URL format.');
      }
      break;
    case 'xdr':
      sanitized = sanitized.trim();
      if (sanitized && !/^[A-Za-z0-9+/=]+$/.test(sanitized)) {
        errors.push('XDR must be base64-encoded.');
      }
      break;
    default:
      sanitized = escapeHtml(stripHtml(sanitized.trim()));
      break;
  }

  return { valid: errors.length === 0, sanitized, errors };
}

export function validatePublicKey(address: string): boolean {
  return PUBLIC_KEY_REGEX.test(sanitizeStellarAddress(address));
}

export function validateContractId(contractId: string): boolean {
  return CONTRACT_ID_REGEX.test(sanitizeStellarAddress(contractId));
}

export function validateMemoId(memo: string): boolean {
  return MEMO_ID_REGEX.test(memo.trim());
}

/**
 * Percent-encode a string for safe use in URLs.
 */
export function encodeForUrl(value: string): string {
  try {
    return encodeURI(value.trim());
  } catch {
    return '';
  }
}

/**
 * HTML-entity encode for attribute contexts.
 */
export function encodeForHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

/**
 * Sanitize an object for safe logging/display.
 */
export function sanitizeObject<T>(obj: T): T {
  return redactSensitive(obj) as T;
}

export { escapeHtml, stripHtml, sanitizeStellarAddress, sanitizeMemo };
