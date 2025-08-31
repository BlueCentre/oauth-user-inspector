import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';

// Check if we're running in Google Cloud (Cloud Run sets this env var)
const isCloudEnvironment = process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT;

// Create transports array
const transports: winston.transport[] = [];

// Add appropriate transports based on environment
if (isCloudEnvironment) {
  // In Google Cloud, use Cloud Logging
  const loggingWinston = new LoggingWinston({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    logName: 'oauth-user-inspector',
    resource: {
      type: 'cloud_run_revision',
      labels: {
        service_name: process.env.K_SERVICE || 'oauth-user-inspector',
        revision_name: process.env.K_REVISION || 'unknown',
        location: process.env.K_CONFIGURATION || process.env.GOOGLE_CLOUD_REGION || 'unknown'
      }
    }
  });
  
  transports.push(loggingWinston);
} else {
  // For local development, use console with better formatting
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
          return `${timestamp} [${level}]: ${message}${metaString}`;
        })
      )
    })
  );
}

// Create logger configuration
const loggerConfig: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'oauth-user-inspector',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports
};

// Create the logger instance
const logger = winston.createLogger(loggerConfig);

// Helper function to create child loggers with additional context
export const createLogger = (context: Record<string, any> = {}) => {
  return logger.child(context);
};

// Helper function to add request context
export const createRequestLogger = (req: any) => {
  const requestId = req.id || req.headers['x-request-id'] || require('uuid').v4();
  
  return logger.child({
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection?.remoteAddress,
    timestamp: new Date().toISOString()
  });
};

// Performance timing helper
export const logTiming = (logger: winston.Logger, label: string) => {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    logger.info('Performance timing', {
      label,
      duration_ms: duration,
      duration_s: (duration / 1000).toFixed(3)
    });
  };
};

// Error logging helper
export const logError = (logger: winston.Logger, error: Error, context: Record<string, any> = {}) => {
  logger.error('Application error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ...context
  });
};

export default logger;
