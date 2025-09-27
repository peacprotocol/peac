/**
 * Jest global teardown to ensure no process listeners linger after the suite
 */

export default async () => {
  // Remove all potential lingering process listeners
  ['SIGINT', 'SIGTERM', 'SIGUSR2', 'uncaughtException', 'unhandledRejection'].forEach((evt) =>
    process.removeAllListeners(evt as any)
  );
};
