import { db } from './db';
import { logger } from './logger';
import { SessionManager } from './whatsapp';

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info(`Received ${signal}. Shutting down sessions...`);
  const sessions = SessionManager.getInstance().getAllSessions();
  for (const session of sessions) {
    logger.info(`Closing session ${session.sessionId}...`);
    await session.disconnect();
    logger.info(`Session ${session.sessionId} closed.`);
  }
  logger.info('All sessions closed.');

  try {
    db.prepare(
      `UPDATE connections SET status = 'disconnected', last_connected_at = (unixepoch()), qrCode = NULL, pairCode = NULL WHERE status IN ('connecting', 'authenticated')`,
    ).run();
    db.run('PRAGMA wal_checkpoint(TRUNCATE);');
    db.run('PRAGMA incremental_vacuum;');
    db.close();
    logger.info('Database cleanup completed.');
  } catch (error) {
    logger.error(
      { error },
      `Error during database cleanup: ${(error as Error).message}`,
    );
  }
  await Bun.sleep(500);
  logger.info('Database connection closed. Exiting now.');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGQUIT', shutdown);
process.on('unhandledRejection', async (reason, promise) => {
  logger.error(reason instanceof Error ? reason.message : String(reason));
});
process.on('uncaughtException', async (err) => {
  logger.error(`Uncaught Exception: ${err.message}, caused by: ${err.stack}`);
});
