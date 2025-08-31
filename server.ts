// FIX: Updated file to use ES Module syntax (`import from`) instead of CommonJS (`import = require()`).
// This resolves all TypeScript compilation errors which indicated that the project is targeting ES modules.
// This change includes:
// 1. Using standard ES module imports for all packages.
// 2. Adding a polyfill for `__dirname` which is not present in ES modules.
// 3. Using the correct `Request` and `Response` types from Express for route handlers.
import express, { Request, Response } from 'express';
import path from 'path';
import fetch, { RequestInit } from 'node-fetch';
import { fileURLToPath, URLSearchParams } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// --- Middleware ---
app.use(express.json());

// --- API Routes ---
// API routes are defined before static file serving.
app.post('/api/oauth-token', async (req: Request, res: Response) => {
  try {
    const { code, provider, clientId, clientSecret, redirectUri } = req.body;

    if (!code || !provider || !clientId || !clientSecret || !redirectUri) {
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
      return res.status(400).json({ error: 'Unsupported provider.' });
    }

    const tokenResponse = await fetch(tokenUrl, fetchOptions);
    const responseText = await tokenResponse.text();

    if (!tokenResponse.ok) {
        console.error(`OAuth Error from ${provider}:`, responseText);
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
    res.json(tokenData);
  } catch (error: any) {
    console.error('Server Error in /api/oauth-token:', error);
    res.status(500).json({ error: 'Internal server error.', message: error.message });
  }
});


// --- Static file serving & SPA Fallback ---
// These routes must come after the API routes.
// Serve frontend files from the dist directory (one level up from dist-server)
const distDir = path.join(__dirname, '..', 'dist');
const rootDir = path.join(__dirname, '..');

// Log the directories for debugging
console.log('__dirname:', __dirname);
console.log('distDir:', distDir);
console.log('rootDir:', rootDir);

// Check if files exist
const fs = require('fs');
console.log('dist/index.html exists:', fs.existsSync(path.join(distDir, 'index.html')));
console.log('root/index.html exists:', fs.existsSync(path.join(rootDir, 'index.html')));

// First, try to serve from dist directory for built assets
app.use('/assets', express.static(path.join(distDir, 'assets')));
// Then serve other static files from dist
app.use(express.static(distDir));
// Fallback to serve from root (for development)
app.use(express.static(rootDir));

// The SPA fallback route sends 'index.html' for any GET request that doesn't match a static file.
app.get('*', (req: Request, res: Response) => {
  console.log('Fallback route for:', req.path);
  // Try dist/index.html first, then fallback to root index.html
  const distIndex = path.resolve(distDir, 'index.html');
  const rootIndex = path.resolve(rootDir, 'index.html');
  
  // Check if dist/index.html exists, if not use root index.html
  const fs = require('fs');
  if (fs.existsSync(distIndex)) {
    console.log('Serving index.html from dist directory');
    res.sendFile(distIndex);
  } else {
    console.log('Serving index.html from root directory');
    res.sendFile(rootIndex);
  }
});


app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
