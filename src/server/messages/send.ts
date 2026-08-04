import { messageStore } from '@/whatsapp';
import { Elysia, t } from 'elysia';
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
      detail: {
        summary: 'Send Text Message',
        description: 'Send a text message via the specified session.',
      },
      body: t.Object({
        deviceId: t.String({
          minLength: 1,
          pattern: '^[a-zA-Z0-9_\\-:@\\.\\|\\!]+$',
        }),
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
    '/send-reply',
    async ({ body: { deviceId, recipient, message, replyMessageKey } }) => {
      const whatsapp = getWA(deviceId);
      const jid = recipient;
      validateJid(jid);

      let quotedMsg = replyMessageKey;
      if (typeof replyMessageKey === 'string') {
        const raw = messageStore.get(deviceId, replyMessageKey) as any;
        if (raw) quotedMsg = raw;
      }

      await whatsapp.sendMessage(
        Bun.randomUUIDv7(),
        jid,
        { text: message },
        { quoted: quotedMsg } as any,
        true,
      );
      return { success: true };
    },
    {
      detail: {
        summary: 'Send Reply',
        description: 'Send a reply to a quoted message.',
      },
      body: t.Object({
        deviceId: t.String(),
        recipient: t.String(),
        message: t.String(),
        replyMessageKey: t.Any(),
        sendPresence: t.Optional(t.Boolean()),
      }),
    },
  );
