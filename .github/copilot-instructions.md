# OAuth User Inspector

OAuth User Inspector is a full-stack web application designed to inspect OAuth user information from providers like GitHub and Google. The application provides a secure backend for handling the OAuth token exchange process.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

- **Bootstrap, build, and test the repository:**
  - `npm install` -- takes ~25 seconds. Set timeout to 60+ seconds.
  - `npm run build` -- takes ~5 seconds. Builds both frontend (Vite) and backend (TypeScript compilation).
  - `npm test` -- takes ~2 seconds. Runs Jest tests with MSW mocking.
  - `npx prettier --write .` -- takes ~3 seconds. Formats all code files.

- **Run the application in development mode:**
  - **ALWAYS run `npm install` and `npm run build` first.**
  - `npm run dev` -- starts both frontend (port 5173) and backend (port 8080) concurrently.
  - Frontend: http://localhost:5173/ (Vite dev server with hot reload)
  - Backend: http://localhost:8080/ (Express server with nodemon auto-restart)
  - **NEVER CANCEL** the dev server - it runs continuously. Use Ctrl+C to stop when done.

- **Production mode:**
  - `npm start` -- **REQUIRES Google Cloud credentials to work**. Will fail in local environment without proper GOOGLE_CLOUD_PROJECT and Secret Manager access.
  - For local testing, always use `npm run dev` instead.

## Validation

- **ALWAYS manually test the application after making changes:**
  - Start with `npm run dev`
  - Navigate to http://localhost:5173/
  - Verify the OAuth User Inspector interface loads correctly
  - Test both GitHub and Google provider tabs
  - Ensure error handling works (hosted OAuth will fail locally - this is expected)

- **Test scenarios to validate changes:**
  - OAuth interface displays correctly with provider selection
  - Form inputs work for Client ID/Secret and PAT entries
  - Error messages display properly when hosted OAuth fails
  - API endpoints respond correctly (test with `curl http://localhost:8080/api/health`)

- **Always run formatting and build validation:**
  - `npx prettier --check .` -- to check code formatting (exit code 1 if formatting needed)
  - `npx prettier --write .` -- to fix formatting issues
  - `npm run build` -- to ensure clean build
  - `npm test` -- to verify tests pass

## Common Tasks

The following are outputs from frequently run commands. Reference them instead of viewing, searching, or running bash commands to save time.

### Repository Root Structure
```
.
├── README.md                 # Project documentation
├── package.json             # Node.js dependencies and scripts
├── App.tsx                  # Main React application component
├── server.ts                # Express backend server
├── logger.ts                # Winston logging configuration
├── components/              # React UI components
├── __tests__/               # Jest test files
├── dist/                    # Frontend build output (created by Vite)
├── dist-server/             # Backend build output (created by TypeScript)
├── scripts/                 # Development and deployment scripts
├── types/                   # TypeScript type definitions
├── Dockerfile               # Container configuration
├── cloudbuild.yaml          # Google Cloud Build configuration
└── .github/                 # GitHub configuration (this file)
```

### Key NPM Scripts
```json
{
  "dev": "concurrently \"npm run dev:frontend\" \"npm run dev:server\"",
  "dev:frontend": "vite",
  "dev:server": "nodemon --watch server.ts --watch logger.ts --ext ts --exec \"npm run build:server && node dist-server/server.js\"",
  "build": "npm run build:frontend && npm run build:server",
  "build:frontend": "vite build",
  "build:server": "tsc -p tsconfig.server.json",
  "start": "GOOGLE_CLOUD_PROJECT=gen-lang-client-0352693779 node dist-server/server.js",
  "test": "jest",
  "setup-dev": "sh scripts/setup-dev.sh",
  "deploy": "./scripts/deploy.sh"
}
```

### Technology Stack
- **Frontend**: React 18 + Vite 6 + Tailwind CSS 3 + TypeScript
- **Backend**: Express 4 + Node.js 20 + TypeScript + Winston logging
- **Testing**: Jest 30 + ts-jest + MSW (Mock Service Worker) + Supertest
- **Build**: Vite (frontend), TypeScript compiler (backend)
- **Deployment**: Docker + Google Cloud Run + Google Cloud Build
- **Development**: Concurrently + Nodemon for auto-reload

### Important File Locations

**Frontend Components** (`/components/`):
- `LoginScreen.tsx` - Main OAuth provider selection interface
- `UserInfoDisplay.tsx` - Display user data after authentication
- `JsonTree.tsx` - JSON data visualization component
- `TopMenu.tsx` - Application navigation menu
- `HelpModal.tsx` - Help and keyboard shortcuts
- `icons.tsx` - SVG icon components

**Backend Files**:
- `server.ts` - Express application with OAuth token exchange endpoints
- `logger.ts` - Structured logging with Google Cloud integration
- `__tests__/server.test.ts` - API endpoint tests with MSW mocking

**Configuration Files**:
- `tsconfig.json` - Frontend TypeScript configuration
- `tsconfig.server.json` - Backend TypeScript configuration
- `vite.config.ts` - Vite bundler configuration with proxy setup
- `jest.config.cjs` - Jest testing framework configuration
- `tailwind.config.js` - Tailwind CSS styling configuration

### API Endpoints
- `POST /api/oauth/token` - Exchange OAuth code for access token
- `GET /api/health` - Health check endpoint
- Static files served from `/dist/` directory

### Development Workflows

**Making Frontend Changes**:
1. Edit files in `/components/`, `App.tsx`, or `/types/`
2. Vite hot reload automatically updates the browser
3. Test in browser at http://localhost:5173/
4. Run `npx prettier --write .` before committing

**Making Backend Changes**:
1. Edit `server.ts`, `logger.ts`, or files in `/types/`
2. Nodemon automatically rebuilds and restarts the server
3. Test API endpoints with curl or frontend integration
4. Run `npm test` to verify tests pass
5. Run `npx prettier --write .` before committing

**Adding Tests**:
- Backend tests go in `__tests__/*.test.ts`
- Use MSW for mocking external API calls
- Tests mock Google Cloud services (Secret Manager, Logging)
- No frontend tests are currently configured

### Deployment Notes
- Application deploys to Google Cloud Run via Docker
- Requires Google Cloud Project with Secret Manager for hosted OAuth
- Environment variables: `GOOGLE_CLOUD_PROJECT`, `NODE_ENV`, `PORT`
- Use `npm run deploy` to deploy (requires gcloud CLI setup)

### Troubleshooting

**Production start fails**: Expected behavior locally. Production mode requires Google Cloud credentials. Use `npm run dev` for local development.

**Port conflicts**: If "address already in use" errors occur, kill existing Node processes with `pkill -f node` and restart.

**Jest appears to hang**: Run `npx jest --detectOpenHandles` to diagnose. Tests should complete within 2 seconds.

**Build errors**: Ensure you have Node.js 18+ and run `npm install` to get the latest dependencies.

**Formatting issues**: Run `npx prettier --write .` to auto-fix all formatting. The project uses Prettier for consistent code style.