# Use the official Node.js 18 image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev dependencies for building)
RUN npm ci

# Copy only necessary source files to avoid conflicts
COPY package.json package-lock.json ./
COPY frontend/ ./frontend/
COPY server/ ./server/
COPY tsconfig.json ./

# Build the application
RUN npm run build

# Show what we built
RUN echo "=== BUILT FILES ===" && ls -la dist/ && echo "" && echo "Built index.html content:" && cat dist/index.html
RUN echo "" && echo "=== FULL DIRECTORY LISTING ===" && find . -name "index.html"
RUN echo "" && echo "=== ORIGINAL FILES ===" && echo "Original index.html content:" && cat frontend/index.html

# COMPLETELY REPLACE the root index.html with the built version
RUN rm -f index.html && cp dist/index.html index.html

# Verify the replacement worked
RUN echo "" && echo "=== FINAL VERIFICATION ===" && echo "Final index.html content:" && cat index.html

# Verify the build output exists
RUN ls -la dist/ && ls -la dist-server/

# Remove dev dependencies to reduce image size
RUN npm ci --only=production && npm cache clean --force

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory to the nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port that the app runs on
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Install curl for health checks
USER root
RUN apk add --no-cache curl
USER nodejs

# Copy and make start script executable
COPY --chown=nodejs:nodejs start.sh ./
RUN chmod +x start.sh

# Health check to ensure the server is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Start the application using our custom script
CMD ["./start.sh"]
