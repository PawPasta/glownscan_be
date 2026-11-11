import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export type RequestWithContext = Request & {
  requestId?: string;
  startedAt?: number;
};

export function requestContext(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
): void {
  request.requestId =
    request.header('x-request-id')?.slice(0, 128) || randomUUID();
  request.startedAt = performance.now();
  response.setHeader('X-Request-Id', request.requestId);
  next();
}
