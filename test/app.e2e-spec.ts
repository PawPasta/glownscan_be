import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';

process.env.GLOWNSCAN_REDIS_URL ??= 'redis://localhost:6379';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const { AppModule } = await import('./../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('reports live and ready only after the test database is reachable', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'connected' });
  });

  it('protects payment history, subscription, support, and admin operations', async () => {
    const server = request(app.getHttpServer());
    await server.get('/payment/subscription').expect(401);
    await server.get('/payment/orders').expect(401);
    await server
      .post(
        '/payment/orders/00000000-0000-4000-8000-000000000001/support-requests',
      )
      .send({ subject: 'Help', note: 'Transfer missing' })
      .expect(401);
    await server.get('/payment/admin/orders').expect(401);
    await server.get('/admin/dashboard/summary').expect(401);
    await server.get('/admin/audit-logs').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
