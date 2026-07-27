import { logger } from '@/logger';
import { SessionManager } from '@/whatsapp/session-manager';
import { Elysia, t } from 'elysia';
import { stringify } from 'qs';

const sessionManager = SessionManager.getInstance();
const refreshGroupsRateLimit = new Map<string, number>();
const REFRESH_GROUPS_COOLDOWN_MS = 60_000 * 5;

export const connections = new Elysia({
  prefix: '/connections',
  detail: {
    tags: ['Connections'],
    description: 'Endpoints to manage connections',
  },
})
  // List all connections
  .get(
    '/',
    () => {
      const sessions = sessionManager.getAllSessionsFromDB();
      return {
        success: true,
        data: sessions,
        count: sessions.length,
      };
    },
    {
      detail: {
        summary: 'List all connections',
        description: 'Get all WhatsApp connections from database',
      },
    },
  )

  // Get single connection
  .get(
    '/:id',
    ({ params: { id }, set }) => {
      const session = sessionManager.getSessionFromDB(id);
      if (!session) {
        set.status = 404;
        return { success: false, message: 'Connection not found' };
      }

      const activeSession = sessionManager.getSession(id);
      return {
        success: true,
        data: {
          ...session,
          isActive: !!activeSession,
          currentStatus: activeSession?.getStatus(),
        },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: 'Get connection by ID',
        description: 'Get a specific WhatsApp connection',
      },
    },
  )

  // Start/Create a new connection
  .post(
    '/start',
    async ({ body, set }) => {
      try {
        const { deviceId, phoneNumber, webhookUrl, name } = body;

        // Skip webhook validation if SKIP_WEBHOOK_VALIDATION=true or no webhookUrl
        if (webhookUrl && process.env.SKIP_WEBHOOK_VALIDATION !== 'true') {
          try {
            const res = await fetch(webhookUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
              },
              body: stringify({
                event: 'ping',
                data: { deviceId: body.deviceId },
              }),
              signal: AbortSignal.timeout(15000), // 15 seconds timeout
              verbose: true,
            });

            if (!res.ok) {
              set.status = 400;

              return {
                error:
                  'Webhook URL must be return 200 HTTP Code. ' +
                  res.status +
                  ' received instead.',
              };
            }
          } catch (error) {
            set.status = 400;

            return error instanceof Error
              ? {
                  error:
                    'Invalid webhook URL: (' +
                    webhookUrl +
                    ') ' +
                    error.message,
                  message: error.message,
                }
              : { error: 'Invalid webhook URL' };
          }
        }

        // get old session from db
        const oldSession = sessionManager.getSessionFromDB(deviceId);

        // Check if session already exists
        let session = sessionManager.getSession(deviceId);

        if (!session) {
          // Create new session
          session = sessionManager.createSession(
            deviceId,
            name ?? oldSession?.name ?? deviceId,
            phoneNumber ?? oldSession?.phoneNumber ?? null,
            webhookUrl ?? oldSession?.webhookUrl ?? null,
          );
        }

        // Connect the session
        session.connect(phoneNumber ?? null, webhookUrl ?? null);

        return {
          success: true,
          message: 'Connection started successfully',
          data: session.getStatus(),
        };
      } catch (err) {
        logger.error({ err }, '[API] Error starting connection');
        set.status = 400;
        return {
          success: false,
          message:
            err instanceof Error ? err.message : 'Failed to start connection',
        };
      }
    },
    {
      body: t.Object({
        deviceId: t.String({
          minLength: 1,
          pattern: '^[a-zA-Z0-9_\\-:@\.\|\!]+$',
        }),
        webhookUrl: t.Optional(
          t.Nullable(
            t.Optional(
              t.String({
                format: 'uri',
              }),
            ),
          ),
        ),
        name: t.Optional(t.Nullable(t.String({ minLength: 1 }))),
        phoneNumber: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Start a connection',
        description: 'Create and start a new WhatsApp connection',
      },
    },
  )

  // Stop a connection
  .post(
    '/stop',
    async ({ body: { deviceId: id }, set }) => {
      try {
        const removed = await sessionManager.removeSession(id);
        if (!removed) {
          set.status = 404;
          return {
            success: false,
            message: 'Connection not found or already stopped',
          };
        }

        return {
          success: true,
          message: 'Connection stopped successfully',
        };
      } catch (err) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to stop connection',
        };
      }
    },
    {
      body: t.Object({
        deviceId: t.String({
          minLength: 1,
          pattern: '^[a-zA-Z0-9_\\-:@\.\|\!]+$',
        }),
        webhookUrl: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Stop a connection',
        description: 'Stop and disconnect a WhatsApp connection',
      },
    },
  )

  // Logout and delete session
  .post(
    '/logout',
    async ({ body: { deviceId: id }, set }) => {
      try {
        const session = sessionManager.getSession(id);
        if (session) {
          sessionManager.removeSessionFromMap(id);
          await session.destroy();
        } else {
          // Session not in map but folder may still exist
          const { rm } = await import('node:fs/promises');
          const { join } = await import('node:path');
          const sessionDir = join(process.cwd(), 'session_data', id);
          await rm(sessionDir, { force: true, recursive: true }).catch(
            () => {},
          );
        }

        sessionManager.deleteSessionFromDB(id);

        return {
          success: true,
          message: 'Session logged out and deleted',
        };
      } catch (err) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to logout session',
        };
      }
    },
    {
      body: t.Object({
        deviceId: t.String({
          minLength: 1,
          pattern: '^[a-zA-Z0-9_\\-:@\.\|\!]+$',
        }),
        webhookUrl: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Logout and delete session',
        description: 'Logout from WhatsApp and delete all session data',
      },
    },
  )

  // Get QR code for a session
  .get(
    '/qr-code',
    ({ query: { deviceId: id }, set }) => {
      const session = sessionManager.getSession(id);
      if (!session) {
        set.status = 404;
        return { success: false, message: 'Session not found' };
      }

      const qrCode = session.getQrCode();
      const pairingCode = session.getPairingCode();

      return {
        success: true,
        data: {
          qrCode,
          pairingCode,
          hasQrCode: qrCode !== null,
          hasPairingCode: pairingCode !== null,
        },
      };
    },
    {
      query: t.Object({
        deviceId: t.String({
          minLength: 1,
          pattern: '^[a-zA-Z0-9_\\-:@\.\|\!]+$',
        }),
      }),
      detail: {
        summary: 'Get QR/Pairing code',
        description:
          'Get the current QR code or pairing code for authentication',
      },
    },
  )

  // SSE endpoint for real-time session events
  // .get(
  //   '/events/:id',
  //   async function* ({ params: { id } }) {
  //     const session = sessionManager.getSession(id);
  //     if (!session) {
  //       yield sse({
  //         event: 'error',
  //         data: { message: 'Session not found' },
  //       });
  //       return;
  //     }

  //     // Send initial status
  //     yield sse({
  //       event: 'connected',
  //       data: {
  //         message: 'SSE stream connected',
  //         status: session.getStatus(),
  //       },
  //     });

  //     // Create a queue for events
  //     const eventQueue: any[] = [];
  //     let resolveNext: ((value: any) => void) | null = null;

  //     const send = (data: any) => {
  //       if (resolveNext) {
  //         resolveNext(data);
  //         resolveNext = null;
  //       } else {
  //         eventQueue.push(data);
  //       }
  //     };

  //     // Subscribe to session events
  //     const unsubscribe = sessionManager.subscribeToSSE(id, send);

  //     try {
  //       // Stream events as they come
  //       while (true) {
  //         let data: any;

  //         if (eventQueue.length > 0) {
  //           data = eventQueue.shift();
  //         } else {
  //           // Wait for next event
  //           data = await new Promise((resolve) => {
  //             resolveNext = resolve;
  //           });
  //         }

  //         yield sse({
  //           event: data.event,
  //           data: data.data,
  //         });
  //       }
  //     } finally {
  //       // Cleanup on disconnect
  //       unsubscribe();
  //     }
  //   },
  //   {
  //     params: t.Object({
  //       id: t.String(),
  //     }),
  //     detail: {
  //       summary: 'SSE events stream',
  //       description:
  //         'Subscribe to real-time events for a session (QR codes, authentication, errors, etc.)',
  //     },
  //   },
  // )

  // Set online status
  .post(
    '/set-online',
    async ({ body, set }) => {
      const id = body.deviceId;
      const session = sessionManager.getSession(id);
      if (!session) {
        set.status = 404;
        return { success: false, message: 'Session not found' };
      }

      const socket = session.getSocket();
      if (!socket) {
        set.status = 400;
        return {
          success: false,
          message: 'Session not connected',
        };
      }

      try {
        await socket.sendPresenceUpdate(
          body.online ? 'available' : 'unavailable',
        );
        return {
          success: true,
          message: `Presence set to ${body.online ? 'online' : 'offline'}`,
        };
      } catch (err) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to update presence',
        };
      }
    },
    {
      body: t.Object({
        deviceId: t.String({
          minLength: 1,
          pattern: '^[a-zA-Z0-9_\\-:@\.\|\!]+$',
        }),
        online: t.Boolean(),
      }),
      detail: {
        summary: 'Set online status',
        description: 'Set the online/offline status for a WhatsApp session',
      },
    },
  )

  .post(
    '/refresh-groups',
    async ({ body, set }) => {
      const id = body.deviceId;
      const session = sessionManager.getSession(id);
      if (!session) {
        set.status = 404;
        return { success: false, message: 'Session not found' };
      }

      const socket = session.getSocket();
      if (!socket) {
        set.status = 400;
        return {
          success: false,
          message: 'Session not connected',
        };
      }

      const now = Date.now();
      const lastRefresh = refreshGroupsRateLimit.get(id);
      if (lastRefresh && now - lastRefresh < REFRESH_GROUPS_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil(
          (REFRESH_GROUPS_COOLDOWN_MS - (now - lastRefresh)) / 1000,
        );
        set.status = 429;
        set.headers['Retry-After'] = String(remainingSeconds);
        return {
          success: false,
          message: `Rate limited. Please wait ${remainingSeconds} seconds before refreshing again.`,
        };
      }

      try {
        await socket.groupFetchAllParticipating();
        refreshGroupsRateLimit.set(id, now);
        return {
          success: true,
          message: `Groups refreshed successfully`,
        };
      } catch (err) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to refresh groups',
        };
      }
    },
    {
      body: t.Object({
        deviceId: t.String({
          minLength: 1,
          pattern: '^[a-zA-Z0-9_\\-:@\.\|\!]+$',
        }),
      }),
      detail: {
        summary: 'Refresh groups',
        description:
          'Refresh the list of groups for a WhatsApp session (rate limited to once per 5 minutes)',
      },
    },
  );
