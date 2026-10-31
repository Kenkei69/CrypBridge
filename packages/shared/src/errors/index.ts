export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'SIMULATION_FORBIDDEN_IN_PROD'
  | 'DESTINATION_NOT_ALLOWED'
  | 'INTERNAL_ERROR';

export interface SerializedAppError {
  code: ErrorCode;
  message: string;
  requestId?: string;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: ErrorCode = 'INTERNAL_ERROR', statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static unauthorized(message = 'Authentication required', details?: unknown): AppError {
    return new AppError(message, 'UNAUTHORIZED', 401, details);
  }

  static forbidden(message = 'Access denied', details?: unknown): AppError {
    return new AppError(message, 'FORBIDDEN', 403, details);
  }

  static notFound(resource = 'Resource', details?: unknown): AppError {
    return new AppError(`${resource} not found`, 'NOT_FOUND', 404, details);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 'BAD_REQUEST', 400, details);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(message, 'VALIDATION_ERROR', 400, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, 'CONFLICT', 409, details);
  }

  static dependencyUnavailable(dependency: string, details?: unknown): AppError {
    return new AppError(`Dependency unavailable: ${dependency}`, 'DEPENDENCY_UNAVAILABLE', 503, details);
  }

  static simulationForbidden(message = 'Simulation adapters cannot be executed in production environment'): AppError {
    return new AppError(message, 'SIMULATION_FORBIDDEN_IN_PROD', 500);
  }

  static destinationNotAllowed(destination: string): AppError {
    return new AppError(`Destination not allowed by policy: ${destination}`, 'DESTINATION_NOT_ALLOWED', 403);
  }

  toJSON(requestId?: string): { error: SerializedAppError } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(requestId ? { requestId } : {}),
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}
