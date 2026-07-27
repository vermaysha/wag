import { logger } from '@/logger';
import { Database } from 'bun:sqlite';

export class MediaQueries {
  constructor(private db: Database) {}

  cacheMedia(key: string, filePath: string, mimeType: string, fileSize: number): void {
    let query;
    try {
      query = this.db.query(
        `INSERT INTO media_cache (message_key, file_path, mime_type, file_size, downloaded_at)
         VALUES ($key, $path, $mime, $size, unixepoch())
         ON CONFLICT(message_key) DO UPDATE SET downloaded_at = unixepoch()`,
      );
      query.run({ $key: key, $path: filePath, $mime: mimeType, $size: fileSize });
    } catch (error) {
      logger.error({ error, key }, '[DatabaseQueries] Error caching media');
    } finally {
      query?.finalize();
    }
  }

  getCachedMedia(key: string): { file_path: string; mime_type: string; file_size: number } | undefined {
    let query;
    try {
      query = this.db.query('SELECT file_path, mime_type, file_size FROM media_cache WHERE message_key = $key');
      return query.get({ $key: key }) as any;
    } catch {
      return undefined;
    } finally {
      query?.finalize();
    }
  }
}
