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
  logger.info('Starting PEAC Protocol v0.9.3');
  
  const server = await createServer();
  const port = config.http.port;
  
  server.listen(port, () => {
    logger.info({ port }, 'Server started');
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
