import { getCorsOptions } from '../src/shared/config/cors.config.js';

describe('CORS configuration', () => {
  it('uses localhost as the default frontend origin', () => {
    expect(getCorsOptions(undefined)).toEqual({
      origin: ['http://localhost:5173'],
      credentials: true,
    });
  });

  it('accepts a comma-separated list of explicit frontend origins', () => {
    expect(
      getCorsOptions(
        'https://glownscan.example, https://admin.glownscan.example',
      ),
    ).toEqual({
      origin: ['https://glownscan.example', 'https://admin.glownscan.example'],
      credentials: true,
    });
  });

  it('rejects wildcard origins when credentials are enabled', () => {
    expect(() => getCorsOptions('*')).toThrow(
      'GLOWNSCAN_FRONTEND_URL must list explicit origins',
    );
  });
});
