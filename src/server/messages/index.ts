import { SessionManager } from '@/whatsapp';
import { isJidGroup, isLidUser, isPnUser } from 'baileys';
import { Elysia } from 'elysia';
import { sendRoutes } from './send';
import { manageRoutes } from './manage';
import { mediaRoutes } from './media';

const manager = SessionManager.getInstance();

export const getWA = (deviceId: string) => {
  const whatsapp = manager.getSession(deviceId);
  if (!whatsapp) throw new Error(`Device ${deviceId} not found, please connect first`);
  return whatsapp;
};

export const validateJid = (jid: string) => {
  if (!(isJidGroup(jid) || isPnUser(jid) || isLidUser(jid))) {
    throw new Error('Invalid recipient JID');
  }
  if (jid.startsWith('+')) {
    throw new Error('Invalid recipient JID, must not include the "+" sign');
  }
};

export const messages = new Elysia({
  prefix: '/messages',
  detail: { tags: ['Messages'], summary: 'Messages', description: 'Endpoints to manage and send messages.' },
})
  .use(sendRoutes)
  .use(manageRoutes)
  .use(mediaRoutes);
