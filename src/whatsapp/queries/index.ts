import { Database } from 'bun:sqlite';
import { ContactsQueries } from './contacts';
import { GroupsQueries } from './groups';

export class DatabaseQueries {
  groups: GroupsQueries;
  contacts: ContactsQueries;

  constructor(private db: Database) {
    this.groups = new GroupsQueries(db);
    this.contacts = new ContactsQueries(db);
  }

  // ── Proxies (backward compat, callers keep using dbQueries.getGroup()) ──

  getGroup(key: string): unknown {
    return this.groups.getGroup(key);
  }
  upsertGroup(key: string, value: unknown): void {
    return this.groups.upsertGroup(key, value);
  }
  upsertContact(
    jid: string,
    name?: string | null,
    photoUrl?: string | null,
  ): void {
    return this.contacts.upsertContact(jid, name, photoUrl);
  }
  getContact(
    jid: string,
  ):
    { jid: string; name: string | null; photo_url: string | null } | undefined {
    return this.contacts.getContact(jid);
  }
}
