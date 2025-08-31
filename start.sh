#!/bin/sh
set -e

echo "🚀 Starting OAuth User Inspector"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"
echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-8080}"

# Check if frontend dist directory exists
if [ ! -d "dist" ]; then
    echo "❌ Error: dist directory (frontend) not found. Frontend build may have failed."
    ls -la
    exit 1
fi

# Check if server dist directory exists
if [ ! -d "dist-server" ]; then
    echo "❌ Error: dist-server directory not found. Server build may have failed."
    ls -la
    exit 1
fi

# Check if server.js exists
if [ ! -f "dist-server/server.js" ]; then
    echo "❌ Error: dist-server/server.js not found. Server build may have failed."
    ls -la dist-server/
    exit 1
fi

echo "✅ Build files found, starting server..."
echo "Contents of dist/ (frontend):"
ls -la dist/
echo "Contents of dist-server/ (backend):"
ls -la dist-server/

# Start the server
exec node dist-server/server.js
