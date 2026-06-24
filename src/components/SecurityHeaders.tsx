import React, { useEffect, useMemo } from 'react';
import { buildSecurityHeaders, generateCspNonce } from '../lib/security/securityHeaders';

export interface SecurityHeadersProps {
  nonce?: string;
}

export function SecurityHeaders({ nonce }: SecurityHeadersProps): JSX.Element {
  const resolvedNonce = useMemo(() => nonce ?? generateCspNonce(), [nonce]);
  const headers = useMemo(() => buildSecurityHeaders(resolvedNonce), [resolvedNonce]);

  useEffect(() => {
    const metaTags = [
      { httpEquiv: 'Content-Security-Policy', content: headers.contentSecurityPolicy },
      { httpEquiv: 'Strict-Transport-Security', content: headers.strictTransportSecurity },
      { httpEquiv: 'Referrer-Policy', content: headers.referrerPolicy },
      { httpEquiv: 'X-Content-Type-Options', content: headers.xContentTypeOptions },
      { httpEquiv: 'X-Frame-Options', content: headers.xFrameOptions },
      { httpEquiv: 'X-XSS-Protection', content: headers.xXssProtection },
      { name: 'permissions-policy', content: headers.permissionsPolicy },
    ];

    const inserted = metaTags.map(({ httpEquiv, name, content }) => {
      const existing = httpEquiv
        ? document.querySelector(`meta[http-equiv="${httpEquiv}"]`)
        : document.querySelector(`meta[name="${name}"]`);

      if (existing) {
        existing.setAttribute('content', content);
        return null;
      }

      const el = document.createElement('meta');
      if (httpEquiv) el.setAttribute('http-equiv', httpEquiv);
      if (name) el.setAttribute('name', name);
      el.setAttribute('content', content);
      document.head.appendChild(el);
      return el;
    });

    return () => {
      inserted.forEach((el) => el && el.parentNode?.removeChild(el));
    };
  }, [headers]);

  return null;
}

export default SecurityHeaders;
