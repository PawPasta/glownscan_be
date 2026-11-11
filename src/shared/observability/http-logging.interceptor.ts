import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { tap } from 'rxjs';
import type { Request, Response } from 'express';
import type { RequestWithContext } from './request-context.js';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        console.info(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            service: 'glownscan-api',
            event: 'http_request',
            requestId: request.requestId,
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
            durationMs: Math.round(
              performance.now() - (request.startedAt ?? performance.now()),
            ),
          }),
        );
      }),
    );
  }
}
