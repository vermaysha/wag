import { SessionManager } from '@/whatsapp';
import { Elysia, t } from 'elysia';

const manager = SessionManager.getInstance();

const getWA = (deviceId: string) => {
  const whatsapp = manager.getSession(deviceId);
  if (!whatsapp) throw new Error(`Device ${deviceId} not found, please connect first`);
  return whatsapp;
};

export const contacts = new Elysia({
  prefix: '/contacts',
  detail: {
    tags: ['Contacts'],
    description: 'Endpoints to get contact information',
  },
})
  .get(
    '/:deviceId',
    ({ params: { deviceId }, set }) => {
      try {
        const whatsapp = getWA(deviceId);
        const dbQueries = whatsapp.getDbQueries();

        if (!dbQueries) {
          set.status = 400;
          return { success: false, message: 'Database not initialized' };
        }

        const chats = dbQueries.listChatJids();
        const unreads = dbQueries.getAllUnreadCounts();

        const contacts = chats.map((chat) => {
          const contact = dbQueries.getContact(chat.chatJid);
          return {
            jid: chat.chatJid,
            name: contact?.name ?? chat.chatJid.split('@')[0],
            photo_url: contact?.photo_url ?? null,
            lastMessage: chat.lastMessage,
            lastTimestamp: chat.lastTimestamp,
            messageCount: chat.count,
            unreadCount: unreads[chat.chatJid] ?? 0,
          };
        });

        return { success: true, data: contacts };
      } catch (error) {
        set.status = 400;
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    {
      params: t.Object({
        deviceId: t.String(),
      }),
      detail: {
        summary: 'List Contacts',
        description: 'Get all contacts with last message and unread count.',
      },
    },
  );
