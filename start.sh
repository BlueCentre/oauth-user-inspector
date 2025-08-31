#!/bin/sh
set -e

echo "🚀 Starting OAuth User Inspector"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"
echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-8080}"

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "❌ Error: dist directory not found. Build may have failed."
    ls -la
    exit 1
fi

# Check if server.js exists
if [ ! -f "dist/server.js" ]; then
    echo "❌ Error: dist/server.js not found. Server build may have failed."
    ls -la dist/
    exit 1
fi

echo "✅ Build files found, starting server..."
echo "Contents of dist/:"
ls -la dist/

# Start the server
exec node dist/server.js
