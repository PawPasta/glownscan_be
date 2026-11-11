import {
  HttpException,
  HttpStatus,
  type HttpExceptionOptions,
} from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    message: string,
    readonly errorCode: string,
    options?: HttpExceptionOptions,
  ) {
    super({ message, errorCode }, status, options);
  }
}

export class AccessTokenExpiredException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'Access token has expired.',
      'ACCESS_TOKEN_EXPIRED',
    );
  }
}

export class InvalidAccessTokenException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'Access token is invalid.',
      'INVALID_ACCESS_TOKEN',
    );
  }
}

export class SessionRevokedException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'Session has been revoked or is no longer active.',
      'SESSION_REVOKED',
    );
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad request', options?: HttpExceptionOptions) {
    super(message, HttpStatus.BAD_REQUEST, options);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized', options?: HttpExceptionOptions) {
    super(message, HttpStatus.UNAUTHORIZED, options);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden', options?: HttpExceptionOptions) {
    super(message, HttpStatus.FORBIDDEN, options);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not found', options?: HttpExceptionOptions) {
    super(message, HttpStatus.NOT_FOUND, options);
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict', options?: HttpExceptionOptions) {
    super(message, HttpStatus.CONFLICT, options);
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(
    message = 'Unprocessable entity',
    options?: HttpExceptionOptions,
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, options);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(
    message = 'Too many requests',
    readonly retryAfterSeconds?: number,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
