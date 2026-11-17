import { AnalysisStatusGateway } from '../src/modules/skin-analysis/presentation/analysis-status.gateway.js';

const userId = 'c30d9edf-5a79-45da-ae83-5adf95610727';
const otherUserId = '9b829ac2-d13f-4964-83d3-01f7f0ddaa39';

function createGateway() {
  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue({
      sub: userId,
      email: 'user@example.com',
      tokenVersion: 0,
      roles: ['USER'],
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  };
  const authentication = {
    validateAccessToken: vi.fn().mockResolvedValue({
      userId,
      email: 'user@example.com',
      tokenVersion: 0,
      roles: ['USER'],
    }),
  };
  const config = { get: vi.fn(), getOrThrow: vi.fn() };
  const gateway = new AnalysisStatusGateway(
    jwt as any,
    authentication as any,
    config as any,
  );
  return { gateway, jwt, authentication };
}

describe('AnalysisStatusGateway', () => {
  it('authenticates the handshake and derives the room from verified identity', async () => {
    const { gateway } = createGateway();
    const client = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
      data: {},
      join: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
      disconnect: vi.fn(),
    };

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith(`user:${userId}`);
    expect(client.emit).toHaveBeenCalledWith('analysis.ready', {
      eventVersion: 1,
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket when the token cannot be validated', async () => {
    const { gateway, jwt } = createGateway();
    jwt.verifyAsync.mockRejectedValue(new Error('invalid token'));
    const client = {
      handshake: { auth: { token: 'bad-token' }, headers: {} },
      data: {},
      join: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    await gateway.handleConnection(client as any);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('forwards status only to the room derived from the event owner', async () => {
    const { gateway } = createGateway();
    const namespace = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    (gateway as any).namespace = namespace;

    await (gateway as any).forwardEvent(
      JSON.stringify({
        userId,
        sessionId: otherUserId,
        status: 'SUCCEEDED',
        errorCode: null,
        occurredAt: '2026-11-16T00:00:00.000Z',
      }),
    );

    expect(namespace.to).toHaveBeenCalledWith(`user:${userId}`);
    expect(namespace.to.mock.results[0].value.emit).toHaveBeenCalledWith(
      'analysis.status',
      {
        sessionId: otherUserId,
        status: 'SUCCEEDED',
        errorCode: null,
        occurredAt: '2026-11-16T00:00:00.000Z',
      },
    );
  });

  it('drops status events with an unknown lifecycle state', async () => {
    const { gateway } = createGateway();
    const namespace = { to: vi.fn() };
    (gateway as any).namespace = namespace;

    await (gateway as any).forwardEvent(
      JSON.stringify({
        userId,
        sessionId: otherUserId,
        status: 'ADMIN_EVENT',
        errorCode: null,
        occurredAt: '2026-11-16T00:00:00.000Z',
      }),
    );

    expect(namespace.to).not.toHaveBeenCalled();
  });
});
