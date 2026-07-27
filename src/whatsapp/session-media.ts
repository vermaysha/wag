import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { downloadContentFromMessage } from 'baileys/lib/Utils/messages-media';
import { proto } from 'baileys';
import type { WhatsAppSession } from './whatsapp-session';

export async function downloadMedia(session: WhatsAppSession, messageKey: string) {
  const dbQueries = session.getDbQueries();
  if (!dbQueries) return null;

  const cached = dbQueries.media.getCachedMedia(messageKey);
  if (cached) return { filePath: cached.file_path, mimeType: cached.mime_type };

  const msg = dbQueries.messages.getMessage(messageKey) as any;
  if (!msg?.message) return null;

  const msgKeys = Object.keys(msg.message);
  if (msgKeys.length === 0) return null;

  const msgType = msgKeys[0]!;
  const mediaContent = msg.message[msgType];
  if (!mediaContent) return null;

  const typeMap: Record<string, string> = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', documentMessage: 'document', stickerMessage: 'sticker' };
  const mediaType = typeMap[msgType];
  if (!mediaType) return null;

  if (!mediaContent.mediaKey && !mediaContent.fileSha256 && !mediaContent.url) return null;

  const ext = msgType === 'imageMessage' ? 'jpg'
    : msgType === 'videoMessage' ? 'mp4'
    : msgType === 'audioMessage' ? (mediaContent.mimetype?.includes('ogg') ? 'ogg' : 'mp3')
    : msgType === 'stickerMessage' ? 'webp'
    : 'bin';

  const mediaDir = `${session.mediaDir}/${mediaType}`;
  await mkdir(mediaDir, { recursive: true });
  const filePath = `${mediaDir}/${messageKey}.${ext}`;

  try {
    const stream = await downloadContentFromMessage(mediaContent, mediaType as any);
    const writeStream = createWriteStream(filePath);
    for await (const chunk of stream as AsyncIterable<Buffer>) writeStream.write(chunk);
    await new Promise<void>((r) => writeStream.end(r));
  } catch (err) {
    try { await import('node:fs/promises').then((m) => m.unlink(filePath)); } catch {}
    return null;
  }

  const mimeType = mediaContent.mimetype ?? `image/${ext}`;
  const stats = await import('node:fs/promises').then((m) => m.stat(filePath));
  dbQueries.media.cacheMedia(messageKey, filePath, mimeType, stats.size);
  return { filePath, mimeType };
}

export async function readMessages(session: WhatsAppSession, jid: string): Promise<boolean> {
  const socket = (session as any).socket;
  const dbQueries = session.getDbQueries();
  if (!socket || !dbQueries) return false;

  try {
    const keys = dbQueries.messages.getUnreadMessageKeys(jid);
    if (keys.length > 0) await socket.readMessages(keys);
    dbQueries.status.resetUnread(jid);
    return true;
  } catch {
    return false;
  }
}
