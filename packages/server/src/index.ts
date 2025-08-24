/* istanbul ignore file */
import 'express-async-errors';
import { createServer } from './http/server';
import { logger } from './logging';
import { config } from './config';

// Global error handlers
process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  logger.fatal({ error }, 'Uncaught exception');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

async function main() {
  logger.info('Starting PEAC Protocol v0.9.8');

  const app = await createServer();
  const port = config.http.port;

  const server = app.listen(port, () => {
    logger.info({ port }, 'Server started');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing server gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, closing server gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
