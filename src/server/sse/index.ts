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
    let unsubscribe: (() => void) | null = null;
    let keepalive: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe?.();
      if (keepalive) clearInterval(keepalive);
    };

    const stream = new ReadableStream({
      start(controller) {
        unsubscribe = WhatsAppSession.subscribeSse(deviceId, (data: string) => {
          if (closed) return;
          if (controller.desiredSize !== null && controller.desiredSize <= 0)
            return;
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
          } catch {}
        });

        keepalive = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(new TextEncoder().encode(':\n\n'));
          } catch {}
        }, 30000);

        request.signal.addEventListener('abort', cleanup);
      },
      cancel: cleanup,
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
