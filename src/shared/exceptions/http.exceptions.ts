import {
  HttpException,
  HttpStatus,
  type HttpExceptionOptions,
} from '@nestjs/common';

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
