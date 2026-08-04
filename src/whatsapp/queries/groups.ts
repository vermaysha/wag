import { logger } from '@/logger';
import { BufferJSON } from 'baileys';
import { Database } from 'bun:sqlite';

export class GroupsQueries {
  constructor(private db: Database) {}

  getGroup(key: string): unknown {
    let query;
    try {
      query = this.db.query(
        'SELECT value FROM groups WHERE key = $key LIMIT 1',
      );
      const row = query.get({ $key: key }) as { value: string } | undefined;
      if (row?.value) return JSON.parse(row.value, BufferJSON.reviver);
      return undefined;
    } catch (error) {
      logger.error({ error, key }, '[GroupsQueries] Error getting group');
      throw error;
    } finally {
      query?.finalize();
    }
  }

  upsertGroup(key: string, value: unknown): void {
    let query;
    try {
      const serialized = JSON.stringify(value, BufferJSON.replacer);
      query = this.db.query(
        `INSERT INTO groups (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = $value`,
      );
      query.run({ $key: key, $value: serialized });
    } catch (error) {
      logger.error({ error, key }, '[GroupsQueries] Error upserting group');
      throw error;
    } finally {
      query?.finalize();
    }
  }
}
