import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Redis } from 'ioredis';
import type { Namespace, Socket } from 'socket.io';
import { AuthenticationService } from '../../auth/application/use-case/authentication.service.js';
import { getCorsOptions } from '../../../shared/config/cors.config.js';
import type { SecurityContext } from '../../../shared/security/security.context.js';
import type { AnalysisStatusEvent } from '../application/ports/analysis-status-publisher.port.js';
import { ANALYSIS_STATUS_CHANNEL } from '../infrastructure/adapters/redis-analysis-status-publisher.adapter.js';

const NAMESPACE = '/skin-analysis';
const ROOM_PREFIX = 'user:';

type AuthenticatedSocket = Socket & { data: { user?: SecurityContext } };

interface JwtClaims {
  sub: string;
  email: string;
  tokenVersion: number;
  roles: string[];
  exp?: number;
}

@WebSocketGateway({
  namespace: NAMESPACE,
  cors: {
    origin: (origin, callback) => {
      try {
        const allowedOrigins = getCorsOptions().origin as string[];
        callback(null, !origin || allowedOrigins.includes(origin));
      } catch {
        callback(null, false);
      }
    },
    credentials: true,
  },
})
export class AnalysisStatusGateway
  implements
    OnGatewayConnection<AuthenticatedSocket>,
    OnGatewayDisconnect<AuthenticatedSocket>,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  private namespace!: Namespace;

  private readonly logger = new Logger(AnalysisStatusGateway.name);
  private subscriber: Redis | undefined;

  constructor(
    private readonly jwt: JwtService,
    private readonly authentication: AuthenticationService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (
      this.config.get<string>(
        'GLOWNSCAN_ANALYSIS_WEBSOCKET_ENABLED',
        'true',
      ) !== 'true'
    )
      return;
    this.subscriber = new Redis(
      this.config.getOrThrow<string>('GLOWNSCAN_REDIS_URL'),
      { maxRetriesPerRequest: null },
    );
    this.subscriber.on('message', (_channel, message) => {
      void this.forwardEvent(message);
    });
    this.subscriber.on('ready', () => {
      void this.subscriber?.subscribe(ANALYSIS_STATUS_CHANNEL).catch(() => {
        this.logger.warn('Could not subscribe to analysis status events.');
      });
    });
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.accessToken(client);
      const claims = await this.jwt.verifyAsync<JwtClaims>(token);
      if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
        client.disconnect(true);
        return;
      }
      const user = await this.authentication.validateAccessToken(claims);
      client.data.user = user;
      await client.join(this.userRoom(user.userId));
      client.emit('analysis.ready', { eventVersion: 1 });
      const expiryTimer = setTimeout(
        () => client.disconnect(true),
        claims.exp * 1000 - Date.now(),
      );
      expiryTimer.unref();
      client.once('disconnect', () => clearTimeout(expiryTimer));
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: AuthenticatedSocket): void {
    // Socket.IO automatically removes disconnected clients from their rooms.
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber && this.subscriber.status === 'ready')
      await this.subscriber.quit();
    else this.subscriber?.disconnect();
  }

  private accessToken(client: AuthenticatedSocket): string {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;
    const authorization = client.handshake.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme === 'Bearer' && token) return token;
    throw new Error('Missing access token.');
  }

  private async forwardEvent(message: string): Promise<void> {
    try {
      const event = JSON.parse(message) as AnalysisStatusEvent;
      if (
        typeof event.userId !== 'string' ||
        typeof event.sessionId !== 'string' ||
        ![
          'UPLOAD_PENDING',
          'QUEUED',
          'RUNNING',
          'SUCCEEDED',
          'FAILED',
        ].includes(event.status) ||
        (event.errorCode !== null && typeof event.errorCode !== 'string') ||
        typeof event.occurredAt !== 'string'
      )
        return;
      this.namespace.to(this.userRoom(event.userId)).emit('analysis.status', {
        sessionId: event.sessionId,
        status: event.status,
        errorCode: event.errorCode,
        occurredAt: event.occurredAt,
      });
    } catch {
      this.logger.warn('Discarded invalid analysis status event.');
    }
  }

  private userRoom(userId: string): string {
    return `${ROOM_PREFIX}${userId}`;
  }
}
