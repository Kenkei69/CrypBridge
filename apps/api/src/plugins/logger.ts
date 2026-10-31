import type { FastifyServerOptions } from 'fastify';

export function getLoggerOptions(logLevel: string): FastifyServerOptions['logger'] {
  return {
    level: logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'headers.authorization',
        'headers.cookie',
        'password',
        'secret',
        'token',
        'privateKey',
        '*.privateKey',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          headers: req.headers,
        };
      },
    },
  };
}
