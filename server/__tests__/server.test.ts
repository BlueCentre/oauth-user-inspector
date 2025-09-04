import request from "supertest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// Ensure required env vars for hosted credential retrieval
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "test-project";

// Mock Google Secret Manager
jest.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: jest.fn().mockImplementation(({ name }) => {
      if (name.includes("GITHUB_APP_OAUTH_CLIENT_ID")) {
        return Promise.resolve([
          {
            payload: { data: "test-github-client-id" },
          },
        ]);
      }
      if (name.includes("GITHUB_APP_OAUTH_CLIENT_SECRET")) {
        return Promise.resolve([
          {
            payload: { data: "test-github-client-secret" },
          },
        ]);
      }
      if (name.includes("GOOGLE_APP_OAUTH_CLIENT_ID")) {
        return Promise.resolve([
          {
            payload: { data: "test-google-client-id" },
          },
        ]);
      }
      if (name.includes("GOOGLE_APP_OAUTH_CLIENT_SECRET")) {
        return Promise.resolve([
          {
            payload: { data: "test-google-client-secret" },
          },
        ]);
      }
      if (name.includes("GITLAB_APP_OAUTH_CLIENT_ID")) {
        return Promise.resolve([
          {
            payload: { data: "test-gitlab-client-id" },
          },
        ]);
      }
      if (name.includes("GITLAB_APP_OAUTH_CLIENT_SECRET")) {
        return Promise.resolve([
          {
            payload: { data: "test-gitlab-client-secret" },
          },
        ]);
      }
      if (name.includes("AUTH0_APP_OAUTH_CLIENT_ID")) {
        return Promise.resolve([
          {
            payload: { data: "test-auth0-client-id" },
          },
        ]);
      }
      if (name.includes("AUTH0_APP_OAUTH_CLIENT_SECRET")) {
        return Promise.resolve([
          {
            payload: { data: "test-auth0-client-secret" },
          },
        ]);
      }
      if (name.includes("AUTH0_APP_OAUTH_DOMAIN")) {
        return Promise.resolve([
          {
            payload: { data: "oauth-user-inspector.us.auth0.com" },
          },
        ]);
      }
      if (name.includes("LINKEDIN_APP_OAUTH_CLIENT_ID")) {
        return Promise.resolve([
          {
            payload: { data: "test-linkedin-client-id" },
          },
        ]);
      }
      if (name.includes("LINKEDIN_APP_OAUTH_CLIENT_SECRET")) {
        return Promise.resolve([
          {
            payload: { data: "test-linkedin-client-secret" },
          },
        ]);
      }
      return Promise.resolve([
        {
          payload: { data: "" },
        },
      ]);
    }),
  })),
}));

// Mock logging-winston to prevent cloud logging attempts in tests
jest.mock("@google-cloud/logging-winston", () => ({
  LoggingWinston: jest.fn().mockImplementation(() => ({
    log: () => {},
    write: () => {},
  })),
}));

// Mock winston to provide a minimal logger implementation
jest.mock("winston", () => {
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
      format: {
        combine: () => {},
        timestamp: () => {},
        errors: () => {},
        json: () => {},
        colorize: () => {},
        printf: () => {},
      },
      transports: { Console: function () {} },
    },
    createLogger: () => fakeLogger,
    format: {
      combine: () => {},
      timestamp: () => {},
      errors: () => {},
      json: () => {},
      colorize: () => {},
      printf: () => {},
    },
    transports: { Console: function () {} },
  };
});

import app from "../server.js";

const restHandlers = [
  // OAuth token exchange handlers
  http.post("https://github.com/login/oauth/access_token", () => {
    return HttpResponse.json({ access_token: "test_access_token" });
  }),
  http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
    const body = await request.text();
    if (body.includes("grant_type=refresh_token")) {
      return HttpResponse.json({
        access_token: "new_google_access_token",
        refresh_token: "new_google_refresh_token",
        expires_in: 3600,
        token_type: "Bearer",
      });
    } else {
      return HttpResponse.json({
        access_token: "new_google_access_token",
        refresh_token: "new_google_refresh_token",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
  }),
  http.post("https://gitlab.com/oauth/token", async ({ request }) => {
    const body = await request.text();
    const isRefresh =
      body.includes('"grant_type":"refresh_token"') ||
      body.includes("grant_type=refresh_token");
    if (isRefresh) {
      return HttpResponse.json({
        access_token: "new_gitlab_access_token",
        refresh_token: "new_gitlab_refresh_token",
        expires_in: 7200,
      });
    } else {
      return HttpResponse.json({
        access_token: "test_gitlab_access_token",
      });
    }
  }),
  http.post(
    "https://oauth-user-inspector.us.auth0.com/oauth/token",
    async ({ request }) => {
      const body = await request.text();
      const isRefresh =
        body.includes('"grant_type":"refresh_token"') ||
        body.includes("grant_type=refresh_token");
      if (isRefresh) {
        return HttpResponse.json({
          access_token: "new_auth0_access_token",
          refresh_token: "new_auth0_refresh_token",
          expires_in: 86400,
        });
      } else {
        return HttpResponse.json({
          access_token: "test_auth0_access_token",
        });
      }
    },
  ),
  http.post(
    "https://www.linkedin.com/oauth/v2/accessToken",
    async ({ request }) => {
      const body = await request.text();
      const isRefresh = body.includes("grant_type=refresh_token");
      if (isRefresh) {
        return HttpResponse.json({
          access_token: "new_linkedin_access_token",
          refresh_token: "new_linkedin_refresh_token",
          expires_in: 5184000,
        });
      } else {
        return HttpResponse.json({
          access_token: "test_linkedin_access_token",
        });
      }
    },
  ),

  // OAuth revocation handlers
  http.post("https://oauth2.googleapis.com/revoke", () => {
    return new HttpResponse(null, { status: 200 });
  }),
  http.delete("https://api.github.com/applications/:clientId/token", () => {
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("https://gitlab.com/oauth/revoke", () => {
    return HttpResponse.json({ success: true });
  }),
  http.post("https://oauth-user-inspector.us.auth0.com/oauth/revoke", () => {
    return HttpResponse.json({ success: true });
  }),
];

const mswServer = setupServer(...restHandlers);

beforeAll(async () => {
  const logger = await import("../logger.js");
  // Bypass unhandled requests (e.g., local supertest calls) instead of treating them as errors
  mswServer.listen({ onUnhandledRequest: "bypass" });
  const noop = () => {};
  jest.spyOn(logger.default, "info").mockImplementation(noop as any);
  jest.spyOn(logger.default, "error").mockImplementation(noop as any);
  jest.spyOn(logger.default, "warn").mockImplementation(noop as any);
});
afterAll(() => mswServer.close());
afterEach(() => mswServer.resetHandlers());

describe("/api/oauth/token", () => {
  it("should return an access token for a valid non-hosted request", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "github",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("access_token", "test_access_token");
  });

  it("should return an access token for a valid hosted request", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "github",
      redirectUri: "http://localhost:3000",
      isHosted: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("access_token", "test_access_token");
  });

  it("should return an access token for GitLab", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "gitlab",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "test_gitlab_access_token",
    );
  });

  it("should return an access token for Google", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "google",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "new_google_access_token",
    );
    expect(response.body).toHaveProperty(
      "refresh_token",
      "new_google_refresh_token",
    );
  });

  it("should return an access token for Auth0", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "auth0",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      auth0Domain: "oauth-user-inspector.us.auth0.com",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "test_auth0_access_token",
    );
  });

  it("should return an access token for LinkedIn", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "linkedin",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "test_linkedin_access_token",
    );
  });

  it("should return 400 for Auth0 without domain", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "auth0",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("should return 400 for unsupported provider", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "facebook",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("should return enhanced OAuth error for invalid_scope", async () => {
    // Mock a GitHub OAuth error response
    mswServer.use(
      http.post("https://github.com/login/oauth/access_token", () => {
        return HttpResponse.json(
          { error: "invalid_scope", error_description: "The requested scope is invalid" },
          { status: 400 }
        );
      })
    );

    const response = await request(app)
      .post("/api/oauth/token")
      .send({
        code: "test_code",
        provider: "github",
        redirectUri: "http://localhost/",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
      });

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("invalid_scope");
    expect(response.body.guide).toBeDefined();
    expect(response.body.guide.title).toBe("Invalid Scope");
    expect(response.body.guide.troubleshooting).toContain("Check that all requested scopes are supported by the OAuth provider");
  });

  it("should return enhanced OAuth error for unauthorized_client", async () => {
    // Mock a Google OAuth error response
    mswServer.use(
      http.post("https://oauth2.googleapis.com/token", () => {
        return HttpResponse.json(
          { error: "unauthorized_client", error_description: "Client authentication failed" },
          { status: 401 }
        );
      })
    );

    const response = await request(app)
      .post("/api/oauth/token")
      .send({
        code: "test_code",
        provider: "google",
        redirectUri: "http://localhost/",
        clientId: "wrong-client-id",
        clientSecret: "wrong-client-secret",
      });

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("unauthorized_client");
    expect(response.body.guide).toBeDefined();
    expect(response.body.guide.title).toBe("Unauthorized Client");
    expect(response.body.guide.troubleshooting).toContain("Verify your Client ID and Client Secret are correct");
  });

  it("should return a 400 error if parameters are missing", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      provider: "github",
      redirectUri: "http://localhost:3000",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("should handle custom scopes in OAuth token exchange", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "github",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000",
      scopes: "read:user,user:email,public_repo",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("access_token", "test_access_token");
  });

  it("should handle custom scopes in hosted OAuth", async () => {
    const response = await request(app).post("/api/oauth/token").send({
      code: "valid_code",
      provider: "github",
      scopes: "read:user,user:email,public_repo",
      redirectUri: "http://localhost:3000",
      isHosted: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("access_token", "test_access_token");
  });
});

describe("/api/health", () => {
  it("should return ok health status", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(typeof response.body.uptime).toBe("number");
  });
});

describe("/api/oauth/refresh", () => {
  it("should refresh a Google token successfully", async () => {
    const response = await request(app).post("/api/oauth/refresh").send({
      provider: "google",
      refreshToken: "test_refresh_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "new_google_access_token",
    );
    expect(response.body).toHaveProperty(
      "refresh_token",
      "new_google_refresh_token",
    );
  });

  it("should refresh a GitLab token successfully", async () => {
    const response = await request(app).post("/api/oauth/refresh").send({
      provider: "gitlab",
      refreshToken: "test_refresh_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "new_gitlab_access_token",
    );
  });

  it("should refresh an Auth0 token successfully", async () => {
    const response = await request(app).post("/api/oauth/refresh").send({
      provider: "auth0",
      refreshToken: "test_refresh_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      auth0Domain: "oauth-user-inspector.us.auth0.com",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "new_auth0_access_token",
    );
  });

  it("should return 400 for GitHub (no refresh token support)", async () => {
    const response = await request(app).post("/api/oauth/refresh").send({
      provider: "github",
      refreshToken: "test_refresh_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toContain(
      "GitHub OAuth Apps do not support refresh tokens",
    );
  });

  it("should return 400 for missing refresh token", async () => {
    const response = await request(app).post("/api/oauth/refresh").send({
      provider: "google",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      "error",
      "Missing required parameters: refreshToken, provider.",
    );
  });

  it("should return 400 for unsupported provider", async () => {
    const response = await request(app).post("/api/oauth/refresh").send({
      provider: "unsupported",
      refreshToken: "test_refresh_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error", "Unsupported provider.");
  });

  it("should handle hosted refresh for Google", async () => {
    const response = await request(app).post("/api/oauth/refresh").send({
      provider: "google",
      refreshToken: "test_refresh_token",
      isHosted: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty(
      "access_token",
      "new_google_access_token",
    );
  });
});

describe("/api/oauth/revoke", () => {
  it("should revoke a Google token successfully", async () => {
    const response = await request(app).post("/api/oauth/revoke").send({
      provider: "google",
      token: "test_access_token",
      tokenTypeHint: "access_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty(
      "message",
      "Token revoked successfully.",
    );
  });

  it("should revoke a GitHub token successfully", async () => {
    const response = await request(app).post("/api/oauth/revoke").send({
      provider: "github",
      token: "test_access_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty(
      "message",
      "Token revoked successfully.",
    );
  });

  it("should revoke a GitLab token successfully", async () => {
    const response = await request(app).post("/api/oauth/revoke").send({
      provider: "gitlab",
      token: "test_access_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty(
      "message",
      "Token revoked successfully.",
    );
  });

  it("should handle LinkedIn token revocation gracefully", async () => {
    const response = await request(app).post("/api/oauth/revoke").send({
      provider: "linkedin",
      token: "test_access_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body.message).toContain(
      "LinkedIn doesn't provide a token revocation endpoint",
    );
  });

  it("should return 400 for missing token", async () => {
    const response = await request(app).post("/api/oauth/revoke").send({
      provider: "google",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      "error",
      "Missing required parameters: token, provider.",
    );
  });

  it("should return 400 for unsupported provider", async () => {
    const response = await request(app).post("/api/oauth/revoke").send({
      provider: "unsupported",
      token: "test_access_token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      isHosted: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error", "Unsupported provider.");
  });

  it("should handle hosted revocation for GitHub", async () => {
    const response = await request(app).post("/api/oauth/revoke").send({
      provider: "github",
      token: "test_access_token",
      isHosted: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
  });
});

describe("/api/explore", () => {
  it("should return 400 for missing parameters", async () => {
    const response = await request(app).post("/api/explore").send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      "error",
      "Missing required fields: provider, accessToken, endpoint",
    );
  });

  it("should return 400 for invalid endpoint", async () => {
    const response = await request(app)
      .post("/api/explore")
      .send({
        provider: "github",
        accessToken: "test_token",
        endpoint: { id: "test" }, // missing url and method
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      "error",
      "Invalid endpoint: missing url or method",
    );
  });

  it("should handle API calls for GitHub endpoints", async () => {
    // Mock the fetch for GitHub API
    const mockResponse = { login: "testuser", id: 123 };
    mswServer.use(
      http.get("https://api.github.com/user", () => {
        return HttpResponse.json(mockResponse);
      }),
    );

    const response = await request(app)
      .post("/api/explore")
      .send({
        provider: "github",
        accessToken: "test_access_token",
        endpoint: {
          id: "user",
          name: "Current User",
          url: "https://api.github.com/user",
          method: "GET",
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("data", mockResponse);
    expect(response.body).toHaveProperty("status", 200);
  });
});
