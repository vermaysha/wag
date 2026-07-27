import { WhatsAppSession } from '@/whatsapp';
import { Elysia } from 'elysia';

export const liveSse = new Elysia({
  prefix: '/sse',
  detail: {
    tags: ['SSE'],
    description: 'Push-based real-time events',
  },
}).get(
  '/:deviceId/live',
  ({ params: { deviceId }, request }) => {
    let closed = false;

    const stream = new ReadableStream({
      start(controller) {
        const unsubscribe = WhatsAppSession.subscribeSse(deviceId, (data: string) => {
          if (!closed) {
            try {
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            } catch {}
          }
        });

        const keepalive = setInterval(() => {
          if (!closed) {
            try {
              controller.enqueue(new TextEncoder().encode(':\n\n'));
            } catch {}
          }
        }, 30000);

        request.signal.addEventListener('abort', () => {
          closed = true;
          unsubscribe();
          clearInterval(keepalive);
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  },
  {
    detail: {
      summary: 'Live incoming events',
      description:
        'Push-based SSE for real-time incoming messages and updates using ReadableStream',
    },
  },
);
