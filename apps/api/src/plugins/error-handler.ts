import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@x402/shared';
import { ZodError } from 'zod';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    // Handle AppError
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, requestId }, error.message);
      } else {
        request.log.warn({ err: error, requestId }, error.message);
      }
      return reply.status(error.statusCode).send(error.toJSON(requestId));
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      request.log.warn({ zodIssues: error.issues, requestId }, 'Request validation failed');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request payload validation failed',
          requestId,
          details: error.flatten().fieldErrors,
        },
      });
    }

    // Handle Fastify built-in schema/body errors
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      const statusCode = error.statusCode;
      if (statusCode === 429) {
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests, please slow down',
            requestId,
          },
        });
      }
      if (statusCode === 413) {
        return reply.status(413).send({
          error: {
            code: 'BAD_REQUEST',
            message: 'Payload too large',
            requestId,
          },
        });
      }
      if (statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send({
          error: {
            code: 'BAD_REQUEST',
            message: error.message,
            requestId,
          },
        });
      }
    }

    // Unexpected internal server errors
    request.log.error({ err: error, requestId }, 'Unhandled internal server error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal server error occurred',
        requestId,
      },
    });
  });
}
