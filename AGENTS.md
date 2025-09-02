# GEMINI.md

## Project Overview

This is a full-stack web application designed to inspect OAuth user information from providers like GitHub and Google. The application provides a secure backend for handling the OAuth token exchange process.

The frontend is a React application built with Vite and styled with Tailwind CSS. It allows users to authenticate using OAuth or a Personal Access Token (PAT). The backend is an Express server written in TypeScript that handles the server-side part of the OAuth flow.

The project is configured for deployment to Google Cloud Run using Docker and Google Cloud Build.

## Building and Running

### Prerequisites

- Node.js
- npm

### Development

To run the application in development mode, use the following command:

```bash
npm run dev
```

This will start the Vite development server for the frontend and the Express server for the backend (using nodemon for automatic restarts).

### Production

To build the application for production, use the following command:

```bash
npm run build
```

This will create a `dist` directory with the optimized frontend assets and a `dist-server` directory with the compiled backend code.

To start the application in production mode, use the following command:

```bash
npm start
```

### Deployment

The application can be deployed to Google Cloud Run using the provided script:

```bash
./deploy.sh
```

This script uses Google Cloud Build to build the Docker image and deploy it to Cloud Run.

## Development Conventions

- **Code Style:** The project uses Prettier for code formatting.
- **Testing:** There are no testing frameworks configured in the project.
- **Commits:** There are no specific commit message conventions enforced.
