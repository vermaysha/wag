import { logger } from '@/logger';
import { openapi } from '@elysiajs/openapi';
import { file } from 'bun';
import { Elysia, t } from 'elysia';
import { version } from 'package.json';
import { stringify } from 'qs';
import icon from '../../assets/icon.ico' with { type: 'file' };
import apiDocs from './client/api-docs.html' with { type: 'text' };
import clientCss from './client/client.css' with { type: 'text' };
import indexClient from './client/index.html' with { type: 'text' };
import { connections } from './connections';
import { contacts } from './contacts';
import { logs } from './logs';
import { messages } from './messages';
import { liveSse } from './sse';

const app = new Elysia()
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
      request = new Request(url.toString(), request);
    }
  })
  .use(
    openapi({
      path: '/docs',
      documentation: {
        info: {
          title: 'WhatsApp Gateway API',
          description:
            'An API to interact with WhatsApp accounts programmatically.',
          version: version,
          license: {
            name: 'MIT',
            url: 'https://opensource.org/license/mit/',
          },
        },
      },
    }),
  )
  .use(connections)
  .use(messages)
  .use(logs)
  .use(contacts)
  .use(liveSse)
  .post(
    '/test-callback',
    async ({ body: { host }, set }) => {
      set.headers['content-type'] = 'application/json';

      try {
        const url = new URL(host);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
            Accept: '*/*',
          },
          body: stringify({
            event: 'ping',
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(1000 * 15),
          verbose: true,
        });

        if (!response.ok) {
          set.status = 500;
          return {
            success: false,
            message: `Callback URL ${url.href} is reachable but returned status ${response.status}.`,
          };
        }

        return {
          success: true,
          message: `Callback URL ${url.href} is valid and reachable.`,
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          message: `Invalid callback URL: ${host}`,
        };
      }
    },
    {
      body: t.Object({
        host: t.String(),
      }),
    },
  )
  .get(
    '/',
    ({ set }) => {
      set.headers['content-type'] = 'text/html';

      return indexClient;
    },
    {
      detail: {
        hide: true,
      },
    },
  )
  .get(
    '/docs/api',
    ({ set }) => {
      set.headers['content-type'] = 'text/html';

      return apiDocs;
    },
    {
      detail: {
        hide: true,
      },
    },
  )
  .get(
    '/client.css',
    ({ set }) => {
      set.headers['content-type'] = 'text/css';

      return clientCss;
    },
    { detail: { hide: true } },
  )
  .get(
    '/icon.ico',
    ({ set }) => {
      set.headers['content-type'] = 'image/x-icon';

      return file(icon);
    },
    { detail: { hide: true } },
  )
  .listen(
    {
      port: Bun.env.PORT ? Number(Bun.env.PORT) : 3000,
      hostname: Bun.env.HOSTNAME ?? '127.0.0.1',
      reusePort: false,
    },
    ({ hostname, port }) => {
      logger.info(`🦊 WhatsApp Gateway API is running at ${hostname}:${port}`);
    },
  );

export { app };
