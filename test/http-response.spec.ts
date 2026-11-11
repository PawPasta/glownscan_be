import {
  ArgumentsHost,
  ConflictException as NestConflictException,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../src/shared/handler/global-exception.filter.js';
import {
  ConflictException,
  AccessTokenExpiredException,
  TooManyRequestsException,
} from '../src/shared/handler/http.exceptions.js';

describe('GlobalExceptionFilter', () => {
  it('returns the common envelope and preserves HTTP exception status', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const exception = new ConflictException('Email already exists');
    const filter = new GlobalExceptionFilter();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/users' }),
      }),
    };

    filter.catch(exception, host as ArgumentsHost);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      status: HttpStatus.CONFLICT,
      message: 'Email already exists',
      data: null,
    });
  });

  it('does not expose unexpected exception details to clients', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const filter = new GlobalExceptionFilter();
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/users' }),
      }),
    };

    filter.catch(new Error('sensitive database detail'), host as ArgumentsHost);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      data: null,
    });
    expect(json).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'sensitive database detail' }),
    );
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('"event":"http_error"'),
    );
    loggerError.mockRestore();
  });

  it('returns the generic internal-server response for HTTP 500 exceptions', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const filter = new GlobalExceptionFilter();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/users' }),
      }),
    };

    filter.catch(
      new HttpException(
        'sensitive internal detail',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
      host as ArgumentsHost,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      data: null,
    });
  });

  it('uses NestJS HTTP exceptions as the base for shared exception types', () => {
    expect(new NestConflictException('duplicate')).toBeInstanceOf(
      HttpException,
    );
    expect(new ConflictException('duplicate')).toBeInstanceOf(HttpException);
  });

  it('adds Retry-After while retaining the standard 429 response envelope', () => {
    const json = vi.fn();
    const setHeader = vi.fn();
    const status = vi.fn(() => ({ json }));
    const filter = new GlobalExceptionFilter();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, setHeader }),
        getRequest: () => ({ method: 'POST', url: '/skin-analysis/analyze' }),
      }),
    };

    filter.catch(
      new TooManyRequestsException('Try later', 30),
      host as ArgumentsHost,
    );

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      status: 429,
      message: 'Try later',
      data: null,
    });
  });

  it('returns a stable auth error code for client refresh handling', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const filter = new GlobalExceptionFilter();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/auth/profile' }),
      }),
    };

    filter.catch(new AccessTokenExpiredException(), host as ArgumentsHost);

    expect(json).toHaveBeenCalledWith({
      status: HttpStatus.UNAUTHORIZED,
      message: 'Access token has expired.',
      data: null,
      errorCode: 'ACCESS_TOKEN_EXPIRED',
    });
  });
});
