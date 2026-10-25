import {
  ArgumentsHost,
  ConflictException as NestConflictException,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../src/shared/handler/global-exception.filter.js';
import { ConflictException } from '../src/shared/handler/http.exceptions.js';

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
      'GET /users failed with status 500.',
      expect.any(String),
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
});
