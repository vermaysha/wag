import { Elysia, t } from 'elysia';
import { getWA } from './index';
import { downloadMedia } from '@/whatsapp';

export const mediaRoutes = new Elysia()
  .get(
    '/media/:deviceId/:messageKey',
    async ({ params: { deviceId, messageKey }, set }) => {
      try {
        const whatsapp = getWA(deviceId);
        const result = await downloadMedia(whatsapp, messageKey);
        if (!result) { set.status = 404; return { success: false, message: 'Media not found' }; }
        const file = Bun.file(result.filePath);
        set.headers['content-type'] = result.mimeType;
        set.headers['cache-control'] = 'public, max-age=86400';
        return file;
      } catch (error) {
        set.status = 400;
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    {
      params: t.Object({ deviceId: t.String(), messageKey: t.String() }),
      detail: { summary: 'Download Media', description: 'Download cached media from a message.' },
    },
  );
