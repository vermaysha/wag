import { logger } from '@/logger';
import { SessionManager } from '@/whatsapp';
import { openapi } from '@elysiajs/openapi';
import { file } from 'bun';
import { Elysia, t } from 'elysia';
import { cpus, freemem, hostname, uptime as osUptime, totalmem } from 'node:os';
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

const startTime = Date.now();

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
  .get(
    '/system/info',
    () => {
      const mem = process.memoryUsage();
      const sessions = SessionManager.getInstance().getAllSessions();

      return {
        success: true,
        data: {
          app: {
            name: 'WAG',
            version,
            description: 'WhatsApp Multi-Session API Server Gateway',
            uptime: Math.floor((Date.now() - startTime) / 1000),
          },
          runtime: {
            bun: Bun.version,
            arch: process.arch,
            platform: process.platform,
            pid: process.pid,
          },
          system: {
            hostname: hostname(),
            cpus: cpus().length,
            memory: {
              total: totalmem(),
              free: freemem(),
              used: totalmem() - freemem(),
              process: mem.rss,
              heap: mem.heapUsed,
            },
            os_uptime: Math.floor(osUptime()),
          },
          sessions: {
            active: sessions.length,
            total_in_db:
              SessionManager.getInstance().getAllSessionsFromDB().length,
          },
        },
      };
    },
    {
      detail: {
        summary: 'System Info',
        description: 'Get detailed system information about the WAG server.',
      },
    },
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
