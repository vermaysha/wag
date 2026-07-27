import { MAX_SESSIONS } from '@/config';
import { db } from '@/db';
import { logger } from '@/logger';
import type { WAConnectionState } from 'baileys';
import { validatePhoneNumber } from './validate-phone-number';
import { WhatsAppSession } from './whatsapp-session';

interface SessionState {
  id: string;
  name: string;
  phoneNumber: string | null;
  webhookUrl: string | null;
  qrCode: string | null;
  pairCode: string | null;
  status: WAConnectionState;
  last_connected_at: number;
  created_at: number;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, WhatsAppSession> = new Map();

  private constructor() {
    this.loadSessionsFromDatabase();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Load all sessions from database on startup
   */
  private loadSessionsFromDatabase(): void {
    try {
      const stmt = db.query('SELECT * FROM connections');
      const connections = stmt.all() as SessionState[];

      logger.info(
        `[SessionManager] Loading ${connections.length} sessions from database...`,
      );

      for (const conn of connections) {
        if (this.sessions.has(conn.id)) {
          logger.warn(
            `[SessionManager] Duplicate session ID in database: ${conn.id}, skipping...`,
          );
          continue;
        }

        try {
          const session = new WhatsAppSession(
            conn.id,
            conn.phoneNumber,
            conn.webhookUrl,
          );

          this.sessions.set(conn.id, session);
          this.attachSessionEventListeners(session);

          // Auto-connect authenticated sessions
          logger.info(
            `[SessionManager] Auto-reconnecting session ${conn.id}...`,
          );
          session.connect().catch((err) => {
            logger.error(
              { err, sessionId: conn.id },
              '[SessionManager] Failed to reconnect',
            );
          });
        } catch (err) {
          logger.error(
            { err, sessionId: conn.id },
            '[SessionManager] Failed to restore session',
          );
        }
      }

      logger.info(
        `[SessionManager] Loaded ${this.sessions.size} active sessions`,
      );
    } catch (err) {
      logger.error(
        { err },
        '[SessionManager] Error loading sessions from database',
      );
    }
  }

  /**
   * Save session state to database
   */
  private saveSessionToDatabase(
    session: WhatsAppSession,
    name: string | null = null,
  ): void {
    try {
      const status = session.getStatus();
      const sessionState: SessionState = {
        id: session.id,
        name: name ?? session.id,
        phoneNumber: session.phoneNumber,
        webhookUrl: session.webhookUrl,
        qrCode: session.getQrCode(),
        pairCode: session.getPairingCode(),
        status: status.isLoggedIn ? 'open' : 'connecting',
        last_connected_at: status.isLoggedIn ? Date.now() : 0,
        created_at: Date.now(),
      };

      const stmt = db.query(`
        INSERT INTO connections (id, name, phoneNumber, webhookUrl, qrCode, pairCode, status, last_connected_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          phoneNumber = excluded.phoneNumber,
          webhookUrl = excluded.webhookUrl,
          qrCode = excluded.qrCode,
          pairCode = excluded.pairCode,
          status = excluded.status,
          last_connected_at = excluded.last_connected_at
      `);

      stmt.run(
        sessionState.id,
        sessionState.name,
        sessionState.phoneNumber,
        sessionState.webhookUrl,
        sessionState.qrCode,
        sessionState.pairCode,
        sessionState.status,
        sessionState.last_connected_at,
        sessionState.created_at,
      );
    } catch (_err) {
      // Silently ignore - DB may be closed during shutdown/logout
    }
  }

  /**
   * Update session status in database
   */
  private updateSessionStatus(
    sessionId: string,
    status: WAConnectionState,
    lastConnectedAt?: number,
  ): void {
    try {
      const stmt = db.query(`
        UPDATE connections
        SET status = ?, last_connected_at = ?
        WHERE id = ?
      `);

      stmt.run(
        status,
        lastConnectedAt ?? (status === 'open' ? Date.now() : 0),
        sessionId,
      );
    } catch (_err) {
      // Silently ignore - DB may be closed during shutdown/logout
    }
  }

  /**
   * Attach event listeners to session for persistence and SSE
   */
  private attachSessionEventListeners(
    session: WhatsAppSession,
    name: string | null = null,
  ): void {
    // Save initial state
    this.saveSessionToDatabase(session, name);

    // QR code received
    session.on('qr', (qr) => {
      if (!this.sessions.has(session.id)) return;
      this.sessions.set(session.id, session);
      this.saveSessionToDatabase(session);
    });

    // Pairing code received
    session.on('pairing-code', (code) => {
      if (!this.sessions.has(session.id)) return;
      this.sessions.set(session.id, session);
      this.saveSessionToDatabase(session);
    });

    // Authenticated
    session.on('authenticated', () => {
      if (!this.sessions.has(session.id)) return;
      this.sessions.set(session.id, session);
      this.saveSessionToDatabase(session);
      this.updateSessionStatus(session.id, 'open', Date.now());
    });

    // Connection closed
    session.on('connection-close', (statusCode) => {
      if (!this.sessions.has(session.id)) return;
      this.saveSessionToDatabase(session);
      this.updateSessionStatus(session.id, 'close');
    });

    // Error occurred
    session.on('error', (error) => {
      if (!this.sessions.has(session.id)) return;
      this.saveSessionToDatabase(session);
      this.updateSessionStatus(session.id, 'close');
    });
  }

  /**
   * Create a new WhatsApp session
   * @param phoneNumber - Phone number for the session (will be validated and normalized)
   * @param autoReconnect - Whether to automatically reconnect on disconnect (default: true)
   * @returns WhatsAppSession instance
   * @throws Error if phone number is invalid, already exists, or max sessions reached
   */
  createSession(
    id: string,
    name: string | null = null,
    phoneNumber: string | null = null,
    webhookUrl: string | null = null,
  ): WhatsAppSession {
    // Validate and normalize phone number (will throw if invalid)
    const normalizedPhone = phoneNumber
      ? validatePhoneNumber(phoneNumber)
      : null;

    // Check if session already exists
    if (this.getSession(id)) {
      throw new Error(`Session already exists for id: ${id}`);
    }

    // Check max sessions limit
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Maximum number of sessions (${MAX_SESSIONS}) reached`);
    }

    // Create new session
    const session = new WhatsAppSession(id, normalizedPhone, webhookUrl);
    this.sessions.set(id, session);

    // Attach event listeners for persistence and SSE
    this.attachSessionEventListeners(session, name);

    // Auto-cleanup when session stops permanently
    session.on('session-stopped', (reason) => {
      logger.info(
        `[SessionManager] Session ${id} stopped permanently (${reason}), auto-removing...`,
      );
      this.sessions.delete(id);
      this.saveSessionToDatabase(session);
      this.updateSessionStatus(id, 'close');
      logger.info(
        `[SessionManager] Session removed (${this.sessions.size}/${MAX_SESSIONS})`,
      );
    });

    logger.info(
      `[SessionManager] Created session for ${id} (${this.sessions.size}/${MAX_SESSIONS})`,
    );

    return session;
  }

  getSession(id: string): WhatsAppSession | undefined {
    try {
      const session = this.sessions.get(id);

      if (session?.getIsConnecting() || session?.getIsLoggedIn()) {
        return session;
      }

      this.sessions.delete(id);
      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  async removeSession(id: string): Promise<boolean> {
    try {
      const session = this.sessions.get(id);

      if (session) {
        await session.disconnect();
        this.sessions.delete(id);
        this.saveSessionToDatabase(session);
        this.updateSessionStatus(id, 'close');
        logger.info(
          `[SessionManager] Removed session for ${id} (${this.sessions.size}/${MAX_SESSIONS})`,
        );
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove session from memory only (no DB update, no disconnect)
   */
  removeSessionFromMap(id: string): void {
    this.sessions.delete(id);
  }

  /**
   * Get all sessions from database (including inactive ones)
   */
  getAllSessionsFromDB(): SessionState[] {
    try {
      const stmt = db.query(
        'SELECT * FROM connections ORDER BY created_at DESC',
      );
      return stmt.all() as SessionState[];
    } catch (err) {
      logger.error({ err }, '[SessionManager] Error getting sessions from DB');
      return [];
    }
  }

  /**
   * Get session state from database
   */
  getSessionFromDB(id: string): SessionState | null {
    try {
      const stmt = db.query('SELECT * FROM connections WHERE id = ?');
      return stmt.get(id) as SessionState | null;
    } catch (err) {
      logger.error(
        { err, sessionId: id },
        '[SessionManager] Error getting session from DB',
      );
      return null;
    }
  }

  /**
   * Delete session from database
   */
  deleteSessionFromDB(id: string): boolean {
    try {
      const stmt = db.query('DELETE FROM connections WHERE id = ?');
      stmt.run(id);
      return true;
    } catch (err) {
      logger.error(
        { err, sessionId: id },
        '[SessionManager] Error deleting session from DB',
      );
      return false;
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): WhatsAppSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Check if a session exists
   */
  hasSession(id: string): boolean {
    try {
      return this.sessions.has(id);
    } catch (error) {
      return false;
    }
  }
}
