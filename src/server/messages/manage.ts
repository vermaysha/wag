import { Elysia, sse, t } from 'elysia';
import { SessionManager, readMessages } from '@/whatsapp';
import { getWA, validateJid } from './index';

const manager = SessionManager.getInstance();

export const manageRoutes = new Elysia()
  .get(
    '/:deviceId',
    ({ params: { deviceId }, set }) => {
      try {
        const whatsapp = getWA(deviceId);
        const dbQueries = whatsapp.getDbQueries();
        if (!dbQueries) { set.status = 400; return { success: false, message: 'Database not initialized' }; }
        return { success: true, data: dbQueries.listChatJids() };
      } catch (error) {
        set.status = 400;
        return { success: false, message: error instanceof Error ? error.message : 'Failed to list chats' };
      }
    },
    {
      params: t.Object({ deviceId: t.String({ minLength: 1, pattern: '^[a-zA-Z0-9_\\-:@\\.\\|\\!]+$' }) }),
      detail: { summary: 'List Chat JIDs', description: 'Get all unique chat JIDs with last message.' },
    },
  )
  .get(
    '/:deviceId/:chatJid',
    ({ params: { deviceId, chatJid }, query, set }) => {
      try {
        const whatsapp = getWA(deviceId);
        const dbQueries = whatsapp.getDbQueries();
        if (!dbQueries) { set.status = 400; return { success: false, message: 'Database not initialized' }; }
        const messages = dbQueries.listMessages(chatJid, query.limit ?? 50, query.offset ?? 0);
        return { success: true, data: messages };
      } catch (error) {
        set.status = 400;
        return { success: false, message: error instanceof Error ? error.message : 'Failed to list messages' };
      }
    },
    {
      params: t.Object({
        deviceId: t.String({ minLength: 1, pattern: '^[a-zA-Z0-9_\\-:@\\.\\|\\!]+$' }),
        chatJid: t.String({ minLength: 1 }),
      }),
      query: t.Object({ limit: t.Optional(t.Number({ default: 50, maximum: 200 })), offset: t.Optional(t.Number({ default: 0 })) }),
      detail: { summary: 'List Messages', description: 'Get messages for a specific chat JID.' },
    },
  )
  .get(
    '/sse/:deviceId/:chatJid',
    async function* ({ params: { deviceId, chatJid }, set }) {
      const whatsapp = manager.getSession(deviceId);
      if (!whatsapp) { set.status = 404; yield sse(JSON.stringify({ error: 'Session not found' })); return; }
      const dbQueries = whatsapp.getDbQueries();
      if (!dbQueries) { set.status = 400; yield sse(JSON.stringify({ error: 'Database not initialized' })); return; }

      let lastCount = 0;
      yield sse(JSON.stringify({ type: 'connected', sessionId: deviceId, chatJid }));
      while (true) {
        try {
          const messages = dbQueries.listMessages(chatJid, 200, 0);
          if (messages.length !== lastCount) { lastCount = messages.length; yield sse(JSON.stringify({ type: 'messages_update', data: messages })); }
        } catch { yield sse(JSON.stringify({ type: 'error', message: 'Failed to fetch messages' })); }
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    {
      params: t.Object({ deviceId: t.String({ minLength: 1, pattern: '^[a-zA-Z0-9_\\-:@\\.\\|\\!]+$' }), chatJid: t.String({ minLength: 1 }) }),
      detail: { summary: 'Per-Chat SSE', description: 'Real-time message updates per chat.' },
    },
  )
  .get(
    '/sse/:deviceId',
    async function* ({ params: { deviceId }, set }) {
      const whatsapp = manager.getSession(deviceId);
      if (!whatsapp) { set.status = 404; yield sse(JSON.stringify({ error: 'Session not found' })); return; }
      const dbQueries = whatsapp.getDbQueries();
      if (!dbQueries) { set.status = 400; yield sse(JSON.stringify({ error: 'Database not initialized' })); return; }

      let lastCount = 0;
      yield sse(JSON.stringify({ type: 'connected', sessionId: deviceId }));
      while (true) {
        try {
          const chats = dbQueries.listChatJids();
          const count = chats.reduce((s, c) => s + c.count, 0);
          if (count !== lastCount) { lastCount = count; yield sse(JSON.stringify({ type: 'messages_update', data: chats })); }
        } catch { yield sse(JSON.stringify({ type: 'error', message: 'Failed to fetch messages' })); }
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    {
      params: t.Object({ deviceId: t.String({ minLength: 1, pattern: '^[a-zA-Z0-9_\\-:@\\.\\|\\!]+$' }) }),
      detail: { summary: 'Session SSE', description: 'Real-time message updates for a session.' },
    },
  )
  .post(
    '/read/:deviceId/:chatJid',
    async ({ params: { deviceId, chatJid } }) => {
      const whatsapp = getWA(deviceId);
      return { success: await readMessages(whatsapp, chatJid) };
    },
    {
      params: t.Object({ deviceId: t.String(), chatJid: t.String() }),
      detail: { summary: 'Mark as Read', description: 'Mark all messages as read.' },
    },
  )
  .post(
    '/delete/:deviceId',
    async ({ params: { deviceId }, body, set }) => {
      try {
        const whatsapp = getWA(deviceId);
        const socket = whatsapp.getSocket();
        if (!socket) { set.status = 400; return { success: false, message: 'Socket not connected' }; }
        await socket.sendMessage(body.jid, { delete: { id: body.messageId, remoteJid: body.jid, fromMe: true } as any });
        return { success: true };
      } catch (error) {
        set.status = 400;
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    {
      body: t.Object({ jid: t.String(), messageId: t.String() }),
      detail: { summary: 'Delete Message', description: 'Delete for everyone.' },
    },
  )
  .post(
    '/forward/:deviceId',
    async ({ params: { deviceId }, body, set }) => {
      try {
        const whatsapp = getWA(deviceId);
        const dbQueries = whatsapp.getDbQueries();
        if (!dbQueries) { set.status = 400; return { success: false, message: 'DB not ready' }; }
        const raw = dbQueries.getMessage(body.messageKey) as any;
        if (!raw?.message) { set.status = 404; return { success: false, message: 'Message not found' }; }
        await whatsapp.sendMessage(Bun.randomUUIDv7(), body.targetJid, { forward: raw } as any, undefined, false);
        return { success: true };
      } catch (error) {
        set.status = 400;
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    {
      body: t.Object({ targetJid: t.String(), messageKey: t.String() }),
      detail: { summary: 'Forward Message', description: 'Forward a message to another chat.' },
    },
  );
