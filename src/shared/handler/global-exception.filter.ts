import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponse } from '../api/api-response.ts';
import { TooManyRequestsException } from './http.exceptions.js';
import { ApiException } from './http.exceptions.js';
import type { RequestWithContext } from '../observability/request-context.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithContext>();
    const originalStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const status =
      originalStatus >= HttpStatus.INTERNAL_SERVER_ERROR
        ? HttpStatus.INTERNAL_SERVER_ERROR
        : originalStatus;
    const message =
      status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : exception instanceof HttpException
          ? this.getHttpExceptionMessage(exception)
          : 'Internal server error';

    const isInternalError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const errorCode =
      exception instanceof ApiException
        ? exception.errorCode
        : getDiagnosticCode(exception);
    const log = {
      timestamp: new Date().toISOString(),
      level: isInternalError ? 'error' : 'warn',
      service: 'glownscan-api',
      event: 'http_error',
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      statusCode: status,
      ...(originalStatus !== status
        ? { originalStatusCode: originalStatus }
        : {}),
      durationMs: request.startedAt
        ? Math.round(performance.now() - request.startedAt)
        : undefined,
      errorCode,
      ...(isInternalError
        ? { diagnostics: collectErrorDiagnostics(exception) }
        : {
            exceptionName: exceptionName(exception),
            errorMessage:
              exception instanceof HttpException
                ? redactSensitiveText(this.getHttpExceptionMessage(exception))
                : undefined,
          }),
    };
    const serializedLog = JSON.stringify(log);
    if (isInternalError) this.logger.error(serializedLog);
    else this.logger.warn(serializedLog);

    const body: ApiResponse<null> = {
      status,
      message,
      data: null,
      code: isInternalError
        ? 'HTTP_500'
        : exception instanceof ApiException
          ? exception.errorCode
          : `HTTP_${status}`,
    };
    if (exception instanceof ApiException && !isInternalError)
      body.errorCode = exception.errorCode;
    if (
      exception instanceof TooManyRequestsException &&
      exception.retryAfterSeconds
    ) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }
    response.status(status).json(body);
  }

  private getHttpExceptionMessage(exception: HttpException): string {
    const exceptionResponse = exception.getResponse();
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (!('message' in exceptionResponse)) {
      return exception.message;
    }

    const message = exceptionResponse.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }

    return exception.message;
  }
}

function exceptionName(exception: unknown): string {
  return exception instanceof Error ? exception.name : 'UNEXPECTED';
}

function getDiagnosticCode(exception: unknown): string {
  if (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception
  ) {
    const code = exception.code;
    if (typeof code === 'string') return code;
  }
  return exceptionName(exception);
}

function collectErrorDiagnostics(
  exception: unknown,
): Array<Record<string, string>> {
  const diagnostics: Array<Record<string, string>> = [];
  const pending: unknown[] = [exception];
  const visited = new Set<unknown>();

  while (pending.length && diagnostics.length < 5) {
    const current = pending.shift();
    if (!(current instanceof Error) || visited.has(current)) continue;
    visited.add(current);
    const details = current as Error & {
      code?: unknown;
      schema?: unknown;
      table?: unknown;
      column?: unknown;
      constraint?: unknown;
      cause?: unknown;
      errors?: unknown;
    };
    const item: Record<string, string> = {
      name: current.name,
      message: redactSensitiveText(current.message),
    };
    if (typeof details.code === 'string') item.code = details.code;
    for (const field of ['schema', 'table', 'column', 'constraint'] as const) {
      if (typeof details[field] === 'string') item[field] = details[field];
    }
    if (current.stack) item.stack = redactSensitiveText(current.stack);
    diagnostics.push(item);
    if (details.cause) pending.push(details.cause);
    if (Array.isArray(details.errors)) pending.push(...details.errors);
  }
  return diagnostics;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+:[^/\s@]*@/gi, '$1[REDACTED]@')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(
      /(["']?(?:password|passphrase|access[_-]?token|refresh[_-]?token|id[_-]?token|fcm[_-]?token|api[_-]?key|secret|authorization|credential)["']?\s*:\s*)("[^"]*"|'[^']*'|[^,}\s]+)/gi,
      '$1"[REDACTED]"',
    )
    .replace(
      /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
      '[REDACTED_JWT]',
    )
    .replace(
      /\b(password|passphrase|[\w-]*token|secret|api[_-]?key|authorization|credential|access[_-]?key|key)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      '$1$2[REDACTED]',
    )
    .slice(0, 8_000);
}
