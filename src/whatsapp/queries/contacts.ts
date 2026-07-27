import { logger } from '@/logger';
import { Database } from 'bun:sqlite';

export class ContactsQueries {
  constructor(private db: Database) {}

  upsertContact(jid: string, name?: string | null, photoUrl?: string | null): void {
    let query;
    try {
      query = this.db.query(
        `INSERT INTO contacts (jid, name, photo_url) VALUES ($jid, $name, $photo)
         ON CONFLICT(jid) DO UPDATE SET name = COALESCE($name, contacts.name)`,
      );
      query.run({ $jid: jid, $name: name ?? null, $photo: photoUrl ?? null });
    } catch (error) {
      logger.error({ error, jid }, '[DatabaseQueries] Error upserting contact');
    } finally {
      query?.finalize();
    }
  }

  getContact(jid: string): { jid: string; name: string | null; photo_url: string | null } | undefined {
    let query;
    try {
      query = this.db.query('SELECT jid, name, photo_url FROM contacts WHERE jid = $jid');
      return query.get({ $jid: jid }) as any;
    } catch {
      return undefined;
    } finally {
      query?.finalize();
    }
  }
}
