import { Database } from 'bun:sqlite';
import { proto } from 'baileys';
import { MessagesQueries } from './messages';
import { ContactsQueries } from './contacts';
import { StatusQueries } from './status';
import { MediaQueries } from './media';

export class DatabaseQueries {
  messages: MessagesQueries;
  contacts: ContactsQueries;
  status: StatusQueries;
  media: MediaQueries;

  constructor(private db: Database) {
    this.messages = new MessagesQueries(db);
    this.contacts = new ContactsQueries(db);
    this.status = new StatusQueries(db);
    this.media = new MediaQueries(db);
  }

  // ── Proxies (backward compat, callers keep using dbQueries.getGroup()) ──

  getGroup(key: string): unknown { return this.messages.getGroup(key); }
  getMessage(key: string): unknown { return this.messages.getMessage(key); }
  upsertMessage(key: string, value: unknown): void { return this.messages.upsertMessage(key, value); }
  upsertGroup(key: string, value: unknown): void { return this.messages.upsertGroup(key, value); }
  deleteOldMessages(cutoffSeconds: number): number { return this.messages.deleteOldMessages(cutoffSeconds); }
  listChatJids(): Array<{ chatJid: string; lastMessage: unknown; count: number; lastTimestamp: number }> { return this.messages.listChatJids(); }
  listMessages(chatJid: string, limit?: number, offset?: number): unknown[] { return this.messages.listMessages(chatJid, limit, offset); }
  getUnreadMessageKeys(jid: string): proto.IMessageKey[] { return this.messages.getUnreadMessageKeys(jid); }
  upsertContact(jid: string, name?: string | null, photoUrl?: string | null): void { return this.contacts.upsertContact(jid, name, photoUrl); }
  getContact(jid: string): { jid: string; name: string | null; photo_url: string | null } | undefined { return this.contacts.getContact(jid); }
  incrementUnread(chatJid: string): void { return this.status.incrementUnread(chatJid); }
  resetUnread(chatJid: string): void { return this.status.resetUnread(chatJid); }
  getUnreadCount(chatJid: string): number { return this.status.getUnreadCount(chatJid); }
  getAllUnreadCounts(): Record<string, number> { return this.status.getAllUnreadCounts(); }
  cacheMedia(key: string, filePath: string, mimeType: string, fileSize: number): void { return this.media.cacheMedia(key, filePath, mimeType, fileSize); }
  getCachedMedia(key: string): { file_path: string; mime_type: string; file_size: number } | undefined { return this.media.getCachedMedia(key); }
}
