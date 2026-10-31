import { AppError, type ControlledDestinationPolicy } from '@x402/shared';

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./, // AWS / cloud metadata IP
  /^0\./,
  /^localhost$/i,
];

export class DefaultDestinationPolicy implements ControlledDestinationPolicy {
  public readonly allowedHosts: string[];
  public readonly allowedProtocols: ('https:' | 'http:')[] = ['https:'];
  public readonly allowLocalhost: boolean;

  constructor(allowedHosts: string[] = [], allowLocalhost = false) {
    this.allowedHosts = allowedHosts.map((h) => h.toLowerCase());
    this.allowLocalhost = allowLocalhost;
    if (allowLocalhost) {
      this.allowedProtocols.push('http:');
    }
  }

  validateUrl(rawUrl: string): { allowed: boolean; reason?: string; sanitizedUrl?: string } {
    try {
      const parsed = new URL(rawUrl);

      if (!this.allowedProtocols.includes(parsed.protocol as 'https:' | 'http:')) {
        return {
          allowed: false,
          reason: `Disallowed protocol: ${parsed.protocol}. Only ${this.allowedProtocols.join(', ')} permitted.`,
        };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Check SSRF private IP attempts
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          if (this.allowLocalhost && (hostname === 'localhost' || hostname === '127.0.0.1')) {
            // Allowed for local test mock only
            continue;
          }
          return {
            allowed: false,
            reason: `SSRF Protection: Access to private or loopback host ${hostname} is forbidden.`,
          };
        }
      }

      // Check allowlist
      if (this.allowedHosts.length > 0 && !this.allowedHosts.includes(hostname)) {
        return {
          allowed: false,
          reason: `Host ${hostname} is not in the trusted merchant destination allowlist.`,
        };
      }

      return {
        allowed: true,
        sanitizedUrl: parsed.toString(),
      };
    } catch {
      return {
        allowed: false,
        reason: 'Malformed URL provided.',
      };
    }
  }

  assertAllowed(rawUrl: string): string {
    const result = this.validateUrl(rawUrl);
    if (!result.allowed || !result.sanitizedUrl) {
      throw AppError.destinationNotAllowed(result.reason || rawUrl);
    }
    return result.sanitizedUrl;
  }
}
