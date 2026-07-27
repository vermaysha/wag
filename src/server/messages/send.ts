import { Elysia, t } from 'elysia';
import { proto } from 'baileys';
import { getWA, validateJid } from './index';

export const sendRoutes = new Elysia()
  .post(
    '/send-text-message',
    ({ body, set }) => {
      const whatsapp = getWA(body.deviceId);
      const jid = body.recipient;
      validateJid(jid);

      whatsapp.sendMessage(
        body.id ?? Bun.randomUUIDv7(),
        jid,
        { text: body.message },
        undefined,
        body.sendPresence ?? false,
        body.delay ?? undefined,
        body.dailyLimit ?? undefined,
      );
      return { success: true };
    },
    {
      detail: { summary: 'Send Text Message', description: 'Send a text message via the specified session.' },
      body: t.Object({
        deviceId: t.String({ minLength: 1, pattern: '^[a-zA-Z0-9_\\-:@\\.\\|\\!]+$' }),
        id: t.Optional(t.Nullable(t.String())),
        delay: t.Optional(t.Number({ minimum: 0, maximum: 300 })),
        sendPresence: t.Optional(t.Boolean()),
        dailyLimit: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
        message: t.String({ minLength: 1, maxLength: 4096 }),
        recipient: t.String({ minLength: 1 }),
      }),
    },
  )
  .post(
    '/send-media',
    async ({ request }) => {
      const formData = await request.formData().catch(() => null);
      if (!formData) return { success: false, message: 'Invalid form data' };

      const deviceId = formData.get('deviceId') as string;
      const recipient = formData.get('recipient') as string;
      const caption = formData.get('caption') as string | null;
      const replyId = formData.get('replyId') as string | null;

      try {
        const whatsapp = getWA(deviceId);
        const dbQueries = whatsapp.getDbQueries();
        const jid = recipient;
        validateJid(jid);

        const file = formData.get('file') as File | null;
        if (!file) return { success: false, message: 'No file provided' };

        const buffer = Buffer.from(await file.arrayBuffer());
        const mime = file.type || 'application/octet-stream';

        let messageContent: any;
        if (mime.startsWith('image/')) messageContent = { image: buffer, caption: caption || '', mimetype: mime };
        else if (mime.startsWith('audio/')) messageContent = { audio: buffer, mimetype: mime };
        else if (mime.startsWith('video/')) messageContent = { video: buffer, caption: caption || '', mimetype: mime };
        else if (mime === 'image/webp') messageContent = { sticker: buffer, mimetype: mime };
        else messageContent = { document: buffer, fileName: file.name || 'file', mimetype: mime, caption: caption || '' };

        const quotedOption = replyId
          ? { quoted: (() => {
              if (dbQueries && replyId.includes('-')) {
                const raw = dbQueries.getMessage(replyId) as any;
                if (raw) return raw;
              }
              return { key: { id: replyId, remoteJid: jid, fromMe: false } as proto.IMessageKey, message: { conversation: '' } };
            })() }
          : undefined;

        await whatsapp.sendMessage(Bun.randomUUIDv7(), jid, messageContent, quotedOption, false);
        return { success: true };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    {
      detail: { summary: 'Send Media Message', description: 'Send image/audio/video/document/sticker.' },
      body: t.Optional(t.Any()),
    },
  )
  .post(
    '/send-reply',
    async ({ body: { deviceId, recipient, message, replyMessageKey } }) => {
      const whatsapp = getWA(deviceId);
      const jid = recipient;
      validateJid(jid);

      const dbQueries = whatsapp.getDbQueries();
      let quotedMsg = replyMessageKey;
      if (typeof replyMessageKey === 'string' && dbQueries) {
        const raw = dbQueries.getMessage(replyMessageKey) as any;
        if (raw) quotedMsg = raw;
      }

      await whatsapp.sendMessage(Bun.randomUUIDv7(), jid, { text: message }, { quoted: quotedMsg } as any, true);
      return { success: true };
    },
    {
      detail: { summary: 'Send Reply', description: 'Send a reply to a quoted message.' },
      body: t.Object({
        deviceId: t.String(), recipient: t.String(), message: t.String(),
        replyMessageKey: t.Any(), sendPresence: t.Optional(t.Boolean()),
      }),
    },
  );
