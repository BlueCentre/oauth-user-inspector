// FIX: Updated file to use ES Module syntax (`import from`) instead of CommonJS (`import = require()`).
// This resolves all TypeScript compilation errors which indicated that the project is targeting ES modules.
// This change includes:
// 1. Using standard ES module imports for all packages.
// 2. Adding a polyfill for `__dirname` which is not present in ES modules.
// 3. Using the correct `Request` and `Response` types from Express for route handlers.
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fetch, { RequestInit } from 'node-fetch';
import { fileURLToPath, URLSearchParams } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger, { createRequestLogger, logTiming, logError } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// --- Middleware ---
// Request ID and logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  
  const reqLogger = createRequestLogger(req);
  req.logger = reqLogger;
  
  reqLogger.info('Incoming request', {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'referer': req.headers.referer
    }
  });
  
  // Log response when finished
  const originalSend = res.send;
  res.send = function(data) {
    reqLogger.info('Response sent', {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      contentLength: data ? data.length : 0
    });
    return originalSend.call(this, data);
  };
  
  next();
});

app.use(express.json());

// --- API Routes ---
// API routes are defined before static file serving.
app.post('/api/oauth-token', async (req: Request, res: Response) => {
  const reqLogger = req.logger || logger;
  const endTimer = logTiming(reqLogger, 'oauth-token-exchange');
  
  try {
    const { code, provider, clientId, clientSecret, redirectUri } = req.body;

    reqLogger.info('OAuth token exchange initiated', {
      provider,
      hasCode: !!code,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      redirectUri: redirectUri // Safe to log redirect URI
    });

    if (!code || !provider || !clientId || !clientSecret || !redirectUri) {
      reqLogger.warn('OAuth token exchange failed - missing parameters', {
        missingFields: {
          code: !code,
          provider: !provider,
          clientId: !clientId,
          clientSecret: !clientSecret,
          redirectUri: !redirectUri
        }
      });
      return res.status(400).json({ error: 'Missing required parameters in request body.' });
    }

    let tokenUrl: string;
    const fetchOptions: RequestInit = {};

    if (provider === 'github') {
      tokenUrl = 'https://github.com/login/oauth/access_token';
      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('code', code);
      params.append('redirect_uri', redirectUri);

      fetchOptions.method = 'POST';
      fetchOptions.headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      fetchOptions.body = params;

    } else if (provider === 'google') {
      tokenUrl = 'https://oauth2.googleapis.com/token';
      fetchOptions.method = 'POST';
      fetchOptions.headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      fetchOptions.body = JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

    } else {
      reqLogger.warn('OAuth token exchange failed - unsupported provider', { provider });
      return res.status(400).json({ error: 'Unsupported provider.' });
    }

    reqLogger.info('Making OAuth provider token request', {
      provider,
      tokenUrl,
      method: fetchOptions.method
    });

    const tokenResponse = await fetch(tokenUrl, fetchOptions);
    const responseText = await tokenResponse.text();

    reqLogger.info('OAuth provider response received', {
      provider,
      statusCode: tokenResponse.status,
      statusText: tokenResponse.statusText,
      responseLength: responseText.length
    });

    if (!tokenResponse.ok) {
        reqLogger.error('OAuth provider error response', {
          provider,
          statusCode: tokenResponse.status,
          statusText: tokenResponse.statusText,
          responseText: responseText.substring(0, 500) // Truncate long responses
        });
        
        try {
            const errorData = JSON.parse(responseText);
            return res.status(tokenResponse.status).json({
                error: errorData.error_description || errorData.error || `Failed to exchange code for token.`,
            });
        } catch (e) {
            const params = new URLSearchParams(responseText);
            const error = params.get('error_description') || params.get('error') || responseText;
            return res.status(tokenResponse.status).json({ error });
        }
    }
    
    const tokenData = JSON.parse(responseText);
    
    reqLogger.info('OAuth token exchange successful', {
      provider,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      expiresIn: tokenData.expires_in
    });
    
    endTimer();
    res.json(tokenData);
  } catch (error: any) {
    logError(reqLogger, error, {
      endpoint: '/api/oauth-token',
      provider: req.body?.provider
    });
    endTimer();
    res.status(500).json({ error: 'Internal server error.', message: error.message });
  }
});


// --- Static file serving & SPA Fallback ---
// These routes must come after the API routes.
// Serve frontend files from the dist directory (one level up from dist-server)
const distDir = path.join(__dirname, '..', 'dist');
const rootDir = path.join(__dirname, '..');

// Log the directories for debugging
logger.info('Static file serving configuration', {
  __dirname,
  distDir,
  rootDir,
  paths: {
    distIndex: path.join(distDir, 'index.html'),
    rootIndex: path.join(rootDir, 'index.html'),
    distAssets: path.join(distDir, 'assets')
  }
});

// Check if files exist and their contents
const distIndexExists = fs.existsSync(path.join(distDir, 'index.html'));
const rootIndexExists = fs.existsSync(path.join(rootDir, 'index.html'));
const distAssetsExists = fs.existsSync(path.join(distDir, 'assets'));

logger.info('File system check', {
  files: {
    'dist/index.html': distIndexExists,
    'root/index.html': rootIndexExists,
    'dist/assets': distAssetsExists
  }
});

// Log directory contents
try {
  const distContents = fs.readdirSync(distDir);
  logger.info('Directory contents', {
    directory: 'dist',
    contents: distContents
  });
  
  if (distAssetsExists) {
    const assetsContents = fs.readdirSync(path.join(distDir, 'assets'));
    logger.info('Directory contents', {
      directory: 'dist/assets',
      contents: assetsContents
    });
  }
} catch (error) {
  logError(logger, error as Error, { context: 'directory-listing' });
}

// IMPORTANT: Only serve from dist directory to avoid serving wrong index.html
// First, try to serve built assets from dist/assets
app.use('/assets', express.static(path.join(distDir, 'assets')));
// Then serve other static files from dist (but exclude index.html to prevent conflicts)
app.use(express.static(distDir, { index: false }));

// DO NOT serve static files from root to avoid source index.html override

// The SPA fallback route sends 'index.html' for any GET request that doesn't match a static file.
app.get('*', (req: Request, res: Response) => {
  const reqLogger = req.logger || logger;
  
  reqLogger.info('SPA fallback route triggered', {
    path: req.path,
    query: req.query,
    referer: req.headers.referer
  });
  
  // Try dist/index.html first, then fallback to root index.html
  const distIndex = path.resolve(distDir, 'index.html');
  const rootIndex = path.resolve(rootDir, 'index.html');
  
  // Check if dist/index.html exists, if not use root index.html
  if (fs.existsSync(distIndex)) {
    reqLogger.info('Serving SPA index.html', {
      source: 'dist',
      file: distIndex
    });
    res.sendFile(distIndex);
  } else {
    reqLogger.info('Serving SPA index.html', {
      source: 'root',
      file: rootIndex,
      reason: 'dist/index.html not found'
    });
    res.sendFile(rootIndex);
  }
});


app.listen(port, '0.0.0.0', () => {
  logger.info('Server started successfully', {
    port,
    host: '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform,
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    uptime: process.uptime() + 's',
    pid: process.pid
  });
});
