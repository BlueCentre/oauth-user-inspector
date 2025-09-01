import request from 'supertest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
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
import app from '../server.js';
const restHandlers = [
    http.post('https://github.com/login/oauth/access_token', () => {
        return HttpResponse.json({ access_token: 'test_access_token' });
    }),
];
const mswServer = setupServer(...restHandlers);
beforeAll(async () => {
    const logger = await import('../logger.js');
    mswServer.listen({ onUnhandledRequest: 'error' });
    const mockLogger = {
        info: () => { },
        error: () => { },
        warn: () => { },
    };
    jest.spyOn(logger.default, 'info').mockImplementation(() => mockLogger);
    jest.spyOn(logger.default, 'error').mockImplementation(() => mockLogger);
    jest.spyOn(logger.default, 'warn').mockImplementation(() => mockLogger);
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
