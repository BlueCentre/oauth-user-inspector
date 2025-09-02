import request from 'supertest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Ensure required env vars for hosted credential retrieval
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';

// Mock Google Secret Manager
jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: jest.fn().mockImplementation(({ name }) => {
      if (name.includes('GITHUB_APP_OAUTH_CLIENT_ID')) {
        return Promise.resolve([{
          payload: { data: 'test-github-client-id' },
        }]);
      }
      if (name.includes('GITHUB_APP_OAUTH_CLIENT_SECRET')) {
        return Promise.resolve([{
          payload: { data: 'test-github-client-secret' },
        }]);
      }
      return Promise.resolve([{
        payload: { data: '' },
      }]);
    }),
  })),
}));

// Mock logging-winston to prevent cloud logging attempts in tests
jest.mock('@google-cloud/logging-winston', () => ({
  LoggingWinston: jest.fn().mockImplementation(() => ({
    log: () => {},
    write: () => {},
  }))
}));

// Mock winston to provide a minimal logger implementation
jest.mock('winston', () => {
  const fakeLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    child: () => fakeLogger,
  };
  return {
    __esModule: true,
    default: {
      createLogger: () => fakeLogger,
      format: { combine: () => {}, timestamp: () => {}, errors: () => {}, json: () => {}, colorize: () => {}, printf: () => {} },
      transports: { Console: function () {} }
    },
    createLogger: () => fakeLogger,
    format: { combine: () => {}, timestamp: () => {}, errors: () => {}, json: () => {}, colorize: () => {}, printf: () => {} },
    transports: { Console: function () {} }
  };
});


import app from '../server.js';

const restHandlers = [
  http.post('https://github.com/login/oauth/access_token', () => {
    return HttpResponse.json({ access_token: 'test_access_token' });
  }),
];

const mswServer = setupServer(...restHandlers);

beforeAll(async () => {
  const logger = await import('../logger.js');
  // Bypass unhandled requests (e.g., local supertest calls) instead of treating them as errors
  mswServer.listen({ onUnhandledRequest: 'bypass' });
  const noop = () => {};
  jest.spyOn(logger.default, 'info').mockImplementation(noop as any);
  jest.spyOn(logger.default, 'error').mockImplementation(noop as any);
  jest.spyOn(logger.default, 'warn').mockImplementation(noop as any);
});
afterAll(() => mswServer.close());
afterEach(() => mswServer.resetHandlers());

describe('/api/oauth/token', () => {
  it('should return an access token for a valid non-hosted request', async () => {
    const response = await request(app)
      .post('/api/oauth/token')
      .send({
        code: 'valid_code',
        provider: 'github',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000',
        isHosted: false,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('access_token', 'test_access_token');
  });

  it('should return an access token for a valid hosted request', async () => {
    const response = await request(app)
      .post('/api/oauth/token')
      .send({
        code: 'valid_code',
        provider: 'github',
        redirectUri: 'http://localhost:3000',
        isHosted: true,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('access_token', 'test_access_token');
  });

  it('should return a 400 error if parameters are missing', async () => {
    const response = await request(app)
      .post('/api/oauth/token')
      .send({
        provider: 'github',
        redirectUri: 'http://localhost:3000',
        isHosted: false,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});
