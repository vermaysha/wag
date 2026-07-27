import { logger } from '@/logger';
import { Database } from 'bun:sqlite';

export class StatusQueries {
  constructor(private db: Database) {}

  incrementUnread(chatJid: string): void {
    let query;
    try {
      query = this.db.query(
        `INSERT INTO chat_status (chat_jid, unread_count, updated_at)
         VALUES ($jid, 1, unixepoch())
         ON CONFLICT(chat_jid) DO UPDATE SET unread_count = chat_status.unread_count + 1, updated_at = unixepoch()`,
      );
      query.run({ $jid: chatJid });
    } catch (error) {
      logger.error({ error, chatJid }, '[DatabaseQueries] Error incrementing unread');
    } finally {
      query?.finalize();
    }
  }

  resetUnread(chatJid: string): void {
    let query;
    try {
      query = this.db.query(
        `INSERT INTO chat_status (chat_jid, unread_count, updated_at)
         VALUES ($jid, 0, unixepoch())
         ON CONFLICT(chat_jid) DO UPDATE SET unread_count = 0, updated_at = unixepoch()`,
      );
      query.run({ $jid: chatJid });
    } catch (error) {
      logger.error({ error, chatJid }, '[DatabaseQueries] Error resetting unread');
    } finally {
      query?.finalize();
    }
  }

  getUnreadCount(chatJid: string): number {
    let query;
    try {
      query = this.db.query('SELECT unread_count FROM chat_status WHERE chat_jid = $jid');
      const row = query.get({ $jid: chatJid }) as { unread_count: number } | undefined;
      return row?.unread_count ?? 0;
    } catch {
      return 0;
    } finally {
      query?.finalize();
    }
  }

  getAllUnreadCounts(): Record<string, number> {
    let query;
    try {
      query = this.db.query('SELECT chat_jid, unread_count FROM chat_status WHERE unread_count > 0');
      const rows = query.all() as Array<{ chat_jid: string; unread_count: number }>;
      const map: Record<string, number> = {};
      for (const r of rows) map[r.chat_jid] = r.unread_count;
      return map;
    } catch {
      return {};
    } finally {
      query?.finalize();
    }
  }
}
