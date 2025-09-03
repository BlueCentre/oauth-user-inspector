import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fetch, { RequestInit } from "node-fetch";
import { URLSearchParams } from "url";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import logger, { createRequestLogger, logTiming, logError } from "./logger.js";

const app = express();
const port = parseInt(process.env.PORT || "8080", 10);

// Initialize Google Secret Manager client
const secretManagerClient = new SecretManagerServiceClient();

process.on("exit", (code) => {
  console.log(`About to exit with code: ${code}`);
});

// Helper function to retrieve secrets from Google Secret Manager
async function getSecret(secretName: string): Promise<string> {
  try {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT or GCP_PROJECT environment variable not set",
      );
    }

    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await secretManagerClient.accessSecretVersion({ name });

    if (!version.payload?.data) {
      throw new Error(`No payload data found for secret: ${secretName}`);
    }

    return version.payload.data.toString();
  } catch (error: any) {
    logger.error("Failed to retrieve secret from Secret Manager", {
      secretName,
      error: error.message,
      stack: error.stack,
    });
    throw new Error(
      `Failed to retrieve secret ${secretName}: ${error.message}`,
    );
  }
}

// Helper function to get hosted OAuth credentials
async function getHostedCredentials(
  provider: "github" | "google" | "gitlab" | "auth0" | "linkedin",
): Promise<{ clientId: string; clientSecret: string }> {
  if (provider === "github") {
    const [clientId, clientSecret] = await Promise.all([
      getSecret("GITHUB_APP_OAUTH_CLIENT_ID"),
      getSecret("GITHUB_APP_OAUTH_CLIENT_SECRET"),
    ]);
    return { clientId, clientSecret };
  } else if (provider === "google") {
    const [clientId, clientSecret] = await Promise.all([
      getSecret("GOOGLE_APP_OAUTH_CLIENT_ID"),
      getSecret("GOOGLE_APP_OAUTH_CLIENT_SECRET"),
    ]);
    return { clientId, clientSecret };
  } else if (provider === "gitlab") {
    const [clientId, clientSecret] = await Promise.all([
      getSecret("GITLAB_APP_OAUTH_CLIENT_ID"),
      getSecret("GITLAB_APP_OAUTH_CLIENT_SECRET"),
    ]);
    return { clientId, clientSecret };
  } else if (provider === "auth0") {
    const [clientId, clientSecret] = await Promise.all([
      getSecret("AUTH0_APP_OAUTH_CLIENT_ID"),
      getSecret("AUTH0_APP_OAUTH_CLIENT_SECRET"),
    ]);
    return { clientId, clientSecret };
  } else if (provider === "linkedin") {
    const [clientId, clientSecret] = await Promise.all([
      getSecret("LINKEDIN_APP_OAUTH_CLIENT_ID"),
      getSecret("LINKEDIN_APP_OAUTH_CLIENT_SECRET"),
    ]);
    return { clientId, clientSecret };
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// --- Middleware ---
// Request ID and logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = (req.headers["x-request-id"] as string) || uuidv4();
  res.setHeader("X-Request-ID", req.id);

  const reqLogger = createRequestLogger(req);
  req.logger = reqLogger;

  reqLogger.info("Incoming request", {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: {
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
      referer: req.headers.referer,
    },
  });

  // Log response when finished
  const originalSend = res.send.bind(res);
  res.send = function (data: any): Response {
    reqLogger.info("Response sent", {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      contentLength: data
        ? typeof data === "string"
          ? data.length
          : JSON.stringify(data).length
        : 0,
    });
    return originalSend(data);
  } as any;

  next();
});

app.use(express.json());

// --- API Routes ---
// API routes are defined before static file serving.
app.post("/api/oauth/token", async (req: Request, res: Response) => {
  const reqLogger = req.logger || logger;
  const endTimer = logTiming(reqLogger, "oauth-token-exchange");

  try {
    const { code, provider, redirectUri, isHosted } = req.body;
    let { clientId, clientSecret, auth0Domain } = req.body;

    reqLogger.info("OAuth token exchange initiated", {
      provider,
      isHosted,
      hasCode: !!code,
      hasRedirectUri: !!redirectUri,
    });

    if (!code || !provider || !redirectUri) {
      reqLogger.warn("OAuth token exchange failed - missing base parameters");
      return res.status(400).json({
        error: "Missing required parameters: code, provider, redirectUri.",
      });
    }

    if (
      provider !== "github" &&
      provider !== "google" &&
      provider !== "gitlab" &&
      provider !== "auth0" &&
      provider !== "linkedin"
    ) {
      reqLogger.warn("OAuth token exchange failed - unsupported provider", {
        provider,
      });
      return res.status(400).json({ error: "Unsupported provider." });
    }

    // Auth0 requires a domain
    if (provider === "auth0" && !auth0Domain && !isHosted) {
      reqLogger.warn("OAuth token exchange failed - missing Auth0 domain");
      return res
        .status(400)
        .json({ error: "Auth0 domain is required for non-hosted auth." });
    }

    // If hosted, retrieve credentials from secret manager. Otherwise, require them in the body.
    if (isHosted) {
      const hostedCreds = await getHostedCredentials(provider);
      clientId = hostedCreds.clientId;
      clientSecret = hostedCreds.clientSecret;
      // Hosted Auth0 also requires the domain
      if (provider === "auth0") {
        try {
          auth0Domain = await getSecret("AUTH0_APP_OAUTH_DOMAIN");
        } catch (e) {
          // leave undefined; the provider-specific check below will handle error response
        }
      }
    } else if (!clientId || !clientSecret) {
      reqLogger.warn(
        "OAuth token exchange failed - missing client credentials for non-hosted flow",
      );
      return res.status(400).json({
        error:
          "Missing required parameters for non-hosted auth: clientId, clientSecret.",
      });
    }

    let tokenUrl: string;
    const fetchOptions: RequestInit = {};

    if (provider === "github") {
      tokenUrl = "https://github.com/login/oauth/access_token";
      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      params.append("code", code);
      params.append("redirect_uri", redirectUri);

      fetchOptions.method = "POST";
      fetchOptions.headers = {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      };
      fetchOptions.body = params;
    } else if (provider === "google") {
      tokenUrl = "https://oauth2.googleapis.com/token";
      fetchOptions.method = "POST";
      fetchOptions.headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      fetchOptions.body = JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
    } else if (provider === "gitlab") {
      tokenUrl = "https://gitlab.com/oauth/token";
      fetchOptions.method = "POST";
      fetchOptions.headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      fetchOptions.body = JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
    } else if (provider === "auth0") {
      if (!auth0Domain) {
        return res.status(400).json({ error: "Auth0 domain is required." });
      }
      tokenUrl = `https://${auth0Domain}/oauth/token`;
      fetchOptions.method = "POST";
      fetchOptions.headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      fetchOptions.body = JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
    } else if (provider === "linkedin") {
      tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
      fetchOptions.method = "POST";
      fetchOptions.headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", redirectUri);
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      fetchOptions.body = params;
    } else {
      // This case is already handled above, but kept for safety.
      return res.status(400).json({ error: "Unsupported provider." });
    }

    reqLogger.info("Making OAuth provider token request", {
      provider,
      tokenUrl,
      method: fetchOptions.method,
    });

    const tokenResponse = await fetch(tokenUrl, fetchOptions);
    const responseText = await tokenResponse.text();

    reqLogger.info("OAuth provider response received", {
      provider,
      statusCode: tokenResponse.status,
    });

    if (!tokenResponse.ok) {
      reqLogger.error("OAuth provider error response", {
        provider,
        statusCode: tokenResponse.status,
        responseText: responseText.substring(0, 500),
      });

      try {
        const errorData = JSON.parse(responseText);
        return res.status(tokenResponse.status).json({
          error:
            errorData.error_description ||
            errorData.error ||
            "Failed to exchange code for token.",
        });
      } catch (e) {
        const params = new URLSearchParams(responseText);
        const error =
          params.get("error_description") ||
          params.get("error") ||
          responseText;
        return res.status(tokenResponse.status).json({ error });
      }
    }

    const tokenData = JSON.parse(responseText);

    reqLogger.info("OAuth token exchange successful", {
      provider,
      hasAccessToken: !!tokenData.access_token,
    });

    endTimer();
    res.json(tokenData);
  } catch (error: any) {
    logError(reqLogger, error, {
      endpoint: "/api/oauth/token",
      provider: req.body?.provider,
    });
    endTimer();
    res
      .status(500)
      .json({ error: "Internal server error.", message: error.message });
  }
});

// Hosted OAuth - Get authorization URL using stored credentials
app.post("/api/oauth-hosted/init", async (req: Request, res: Response) => {
  const reqLogger = req.logger || logger;
  const endTimer = logTiming(reqLogger, "oauth-hosted-init");

  try {
    const { provider, redirectUri } = req.body;

    reqLogger.info("Hosted OAuth initialization requested", {
      provider,
      hasRedirectUri: !!redirectUri,
      redirectUri: redirectUri, // Safe to log redirect URI
    });

    if (!provider || !redirectUri) {
      reqLogger.warn(
        "Hosted OAuth initialization failed - missing parameters",
        {
          missingFields: {
            provider: !provider,
            redirectUri: !redirectUri,
          },
        },
      );
      return res.status(400).json({
        error: "Missing required parameters: provider and redirectUri.",
      });
    }

    if (
      !["github", "google", "gitlab", "auth0", "linkedin"].includes(provider)
    ) {
      reqLogger.warn(
        "Hosted OAuth initialization failed - unsupported provider",
        { provider },
      );
      return res.status(400).json({
        error:
          "Unsupported provider. Supported providers are: github, google, gitlab, auth0, linkedin.",
      });
    }

    // Retrieve hosted credentials
    const { clientId } = await getHostedCredentials(provider);

    let authUrl = "";

    if (provider === "github") {
      const scope = "read:user,user:email";
      authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=github-hosted`;
    } else if (provider === "google") {
      const scope =
        "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=google-hosted`;
    } else if (provider === "gitlab") {
      const scope = "read_user";
      authUrl = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=gitlab-hosted`;
    } else if (provider === "auth0") {
      // For hosted Auth0, we'll need to get the domain from configuration
      // For now, we'll use a placeholder that should be configured
      const auth0Domain = await getSecret("AUTH0_APP_OAUTH_DOMAIN").catch(
        () => "your-tenant.us.auth0.com",
      );
      const scope = "openid profile email";
      authUrl = `https://${auth0Domain}/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=auth0-hosted`;
    } else if (provider === "linkedin") {
      const scope = "r_liteprofile r_emailaddress";
      authUrl = `https://www.linkedin.com/oauth/v2/authorization?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=linkedin-hosted`;
    }

    reqLogger.info("Hosted OAuth authorization URL generated", {
      provider,
      hasAuthUrl: !!authUrl,
    });

    endTimer();
    res.json({ authUrl });
  } catch (error: any) {
    logError(reqLogger, error, {
      endpoint: "/api/oauth-hosted/init",
      provider: req.body?.provider,
    });
    endTimer();
    res.status(500).json({
      error: "Failed to initialize hosted OAuth.",
      message: error.message,
    });
  }
});

// Hosted OAuth - Report availability based on presence of Secret Manager keys
app.get(
  "/api/oauth-hosted/availability",
  async (req: Request, res: Response) => {
    const reqLogger = req.logger || logger;
    const endTimer = logTiming(reqLogger, "oauth-hosted-availability");

    const secretExists = async (name: string): Promise<boolean> => {
      try {
        await getSecret(name);
        return true;
      } catch {
        return false;
      }
    };

    try {
      const [github, google, gitlab, auth0Id, auth0Secret, auth0Domain, linkedin] =
        await Promise.all([
          Promise.all([
            secretExists("GITHUB_APP_OAUTH_CLIENT_ID"),
            secretExists("GITHUB_APP_OAUTH_CLIENT_SECRET"),
          ]).then(([id, secret]) => id && secret),
          Promise.all([
            secretExists("GOOGLE_APP_OAUTH_CLIENT_ID"),
            secretExists("GOOGLE_APP_OAUTH_CLIENT_SECRET"),
          ]).then(([id, secret]) => id && secret),
          Promise.all([
            secretExists("GITLAB_APP_OAUTH_CLIENT_ID"),
            secretExists("GITLAB_APP_OAUTH_CLIENT_SECRET"),
          ]).then(([id, secret]) => id && secret),
          secretExists("AUTH0_APP_OAUTH_CLIENT_ID"),
          secretExists("AUTH0_APP_OAUTH_CLIENT_SECRET"),
          secretExists("AUTH0_APP_OAUTH_DOMAIN"),
          Promise.all([
            secretExists("LINKEDIN_APP_OAUTH_CLIENT_ID"),
            secretExists("LINKEDIN_APP_OAUTH_CLIENT_SECRET"),
          ]).then(([id, secret]) => id && secret),
        ]);

      const availability = {
        github,
        google,
        gitlab,
        auth0: auth0Id && auth0Secret && auth0Domain,
        linkedin,
      };

      reqLogger.info("Hosted availability computed", { availability });
      endTimer();
      res.json({ availability });
    } catch (error: any) {
      logError(reqLogger, error, { endpoint: "/api/oauth-hosted/availability" });
      endTimer();
      res.status(500).json({ error: "Failed to check availability." });
    }
  },
);

// This endpoint is now consolidated into /api/oauth/token
// app.post('/api/oauth-hosted/token', ...);

// Lightweight health / readiness endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    node: process.version,
  });
});

// --- Static file serving & SPA Fallback ---
// Use process.cwd() so tests and production builds resolve consistently
const baseDir = process.cwd();
const distDir = path.join(baseDir, "dist");
const rootDir = baseDir;

// Log the directories for debugging
logger.info("Static file serving configuration", {
  baseDir,
  distDir,
  rootDir,
  paths: {
    distIndex: path.join(distDir, "index.html"),
    rootIndex: path.join(rootDir, "index.html"),
    distAssets: path.join(distDir, "assets"),
  },
});

// Check if files exist and their contents
const distIndexExists = fs.existsSync(path.join(distDir, "index.html"));
const rootIndexExists = fs.existsSync(path.join(rootDir, "index.html"));
const distAssetsExists = fs.existsSync(path.join(distDir, "assets"));

logger.info("File system check", {
  files: {
    "dist/index.html": distIndexExists,
    "root/index.html": rootIndexExists,
    "dist/assets": distAssetsExists,
  },
});

// Log directory contents
try {
  const distContents = fs.readdirSync(distDir);
  logger.info("Directory contents", {
    directory: "dist",
    contents: distContents,
  });

  if (distAssetsExists) {
    const assetsContents = fs.readdirSync(path.join(distDir, "assets"));
    logger.info("Directory contents", {
      directory: "dist/assets",
      contents: assetsContents,
    });
  }
} catch (error) {
  logger.error("directory-listing", { error });
}

// IMPORTANT: Only serve from dist directory to avoid serving wrong index.html
// First, try to serve built assets from dist/assets
app.use("/assets", express.static(path.join(distDir, "assets")));
// Then serve other static files from dist (but exclude index.html to prevent conflicts)
app.use(express.static(distDir, { index: false }));

// DO NOT serve static files from root to avoid source index.html override

// The SPA fallback route sends 'index.html' for any GET request that doesn't match a static file.
app.get("*", (req, res) => {
  const reqLogger = req.logger || logger;

  reqLogger.info("SPA fallback route triggered", {
    path: req.path,
    query: req.query,
    referer: req.headers.referer,
  });

  // Try dist/index.html first, then fallback to root index.html
  const distIndex = path.resolve(distDir, "index.html");
  const rootIndex = path.resolve(rootDir, "index.html");

  // Check if dist/index.html exists, if not use root index.html
  if (fs.existsSync(distIndex)) {
    reqLogger.info("Serving SPA index.html", {
      source: "dist",
      file: distIndex,
    });
    res.sendFile(distIndex);
  } else {
    reqLogger.info("Serving SPA index.html", {
      source: "root",
      file: rootIndex,
      reason: "dist/index.html not found",
    });
    res.sendFile(rootIndex);
  }
});

// --- Error Handling ---
// Generic error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const reqLogger = req.logger || logger;
  logError(reqLogger, err, {
    endpoint: req.originalUrl,
    method: req.method,
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: "An unexpected error occurred.",
    message: err.message,
    requestId: req.id,
  });
});

// Unhandled promise rejection handler
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  logger.error("Unhandled Rejection", {
    reason: (reason as any)?.message || reason,
    stack: (reason as any)?.stack,
    promise,
  });
});

// Uncaught exception handler
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception", {
    message: error.message,
    stack: error.stack,
  });
  // It's generally recommended to exit the process after an uncaught exception
  process.exit(1);
});

// Avoid listening when running in Jest tests to prevent open handle issues
if (!process.env.JEST_WORKER_ID) {
  app.listen(port, "0.0.0.0", () => {
    logger.info("Server started successfully", {
      port,
      host: "0.0.0.0",
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
        heapUsed:
          Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
        heapTotal:
          Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
      },
      uptime: process.uptime() + "s",
      pid: process.pid,
    });
  });
}

export default app;
