const MAX_PER_DEVICE = Number(Bun.env.SENT_MESSAGES_PER_DEVICE ?? 50);

interface ChatIndex {
  lastKey: string;
  lastMessage: unknown;
  count: number;
  lastTimestamp: number;
}

export interface ChatSummary {
  chatJid: string;
  lastMessage: unknown;
  count: number;
  lastTimestamp: number;
}

/**
 * Per-device store of the most recent SENT messages (fromMe only).
 * Incoming messages and media are intentionally not stored to keep memory
 * and CPU low. Each device is capped at MAX_PER_DEVICE messages; the oldest
 * sent message is evicted when the cap is exceeded.
 */
class MessageStore {
  private devices = new Map<string, Map<string, unknown>>();
  private chats = new Map<string, Map<string, ChatIndex>>();

  private device(deviceId: string): Map<string, unknown> {
    let m = this.devices.get(deviceId);
    if (!m) {
      m = new Map();
      this.devices.set(deviceId, m);
    }
    return m;
  }

  private chatIndex(deviceId: string): Map<string, ChatIndex> {
    let m = this.chats.get(deviceId);
    if (!m) {
      m = new Map();
      this.chats.set(deviceId, m);
    }
    return m;
  }

  upsert(deviceId: string, msg: any): void {
    if (!msg?.key?.id || !msg?.key?.remoteJid) return;
    if (!msg.key.fromMe) return;

    const key = `${msg.key.remoteJid}-${msg.key.id}`;
    const dev = this.device(deviceId);
    const existing = dev.get(key);
    const isNew = !existing;

    if (existing) {
      Object.assign(existing, msg);
    } else {
      dev.set(key, msg);
      this.updateChatIndex(deviceId, msg, key, true);
      this.evict(deviceId);
      return;
    }
    this.updateChatIndex(deviceId, msg, key, false);
  }

  get(deviceId: string, msgKey: string): unknown {
    return this.device(deviceId).get(msgKey);
  }

  listMessages(
    deviceId: string,
    chatJid: string,
    limit = 50,
    offset = 0,
  ): unknown[] {
    const dev = this.device(deviceId);
    const prefix = `${chatJid}-`;
    const out: unknown[] = [];
    for (const [k, v] of dev) {
      if (k.startsWith(prefix)) out.push(v);
    }
    out.reverse();
    return out.slice(offset, offset + limit);
  }

  listChatJids(deviceId: string): ChatSummary[] {
    const idx = this.chatIndex(deviceId);
    const dev = this.device(deviceId);
    const out: ChatSummary[] = [];
    for (const [jid, chat] of idx) {
      let lastMessage = chat.lastMessage;
      if (lastMessage && !dev.has(chat.lastKey)) {
        lastMessage = null;
      }
      if (lastMessage === null) {
        lastMessage = this.recomputeLastMessage(dev, jid);
        const best = lastMessage as any;
        if (best?.key?.id && best.key.remoteJid === jid) {
          chat.lastKey = `${jid}-${best.key.id}`;
        }
      }
      out.push({
        chatJid: jid,
        lastMessage,
        count: chat.count,
        lastTimestamp: chat.lastTimestamp,
      });
    }
    out.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    return out;
  }

  private recomputeLastMessage(
    dev: Map<string, unknown>,
    jid: string,
  ): unknown {
    let best: unknown = null;
    let bestTs = 0;
    for (const [k, v] of dev) {
      if (!k.startsWith(`${jid}-`)) continue;
      const msg = v as any;
      const ts = Number(msg.messageTimestamp ?? 0);
      if (ts >= bestTs) {
        best = v;
        bestTs = ts;
      }
    }
    return best;
  }

  private updateChatIndex(
    deviceId: string,
    msg: any,
    key: string,
    isNew: boolean,
  ): void {
    const jid = msg.key.remoteJid;
    const ts = Number(msg.messageTimestamp ?? 0);
    const idx = this.chatIndex(deviceId);
    const chat = idx.get(jid);
    if (!chat) {
      idx.set(jid, {
        lastKey: key,
        lastMessage: msg,
        count: 1,
        lastTimestamp: ts,
      });
      return;
    }
    if (isNew) chat.count++;
    if (ts >= chat.lastTimestamp) {
      chat.lastKey = key;
      chat.lastMessage = msg;
      chat.lastTimestamp = ts;
    }
  }

  private evict(deviceId: string): void {
    const dev = this.device(deviceId);
    while (dev.size > MAX_PER_DEVICE) {
      const first = dev.entries().next().value as [string, unknown] | undefined;
      if (!first) break;
      const [key] = first;
      dev.delete(key);
      this.onEvict(deviceId, key);
    }
  }

  private onEvict(deviceId: string, key: string): void {
    const dash = key.indexOf('-');
    if (dash < 0) return;
    const jid = key.slice(0, dash);
    const idx = this.chatIndex(deviceId);
    const chat = idx.get(jid);
    if (!chat) return;
    chat.count--;
    if (chat.lastKey === key) chat.lastMessage = null;
    if (chat.count <= 0) idx.delete(jid);
  }
}

export const messageStore = new MessageStore();
