interface Session {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  metadata: Record<string, string>;
}

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export class SessionManager {
  private sessions = new Map<string, Session>();
  private userSessions = new Map<string, Set<string>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private maxSessionsPerUser = 5;

  constructor() {
    this.startCleanup();
  }

  createSession(userId: string, metadata?: Record<string, string>): string {
    const existing = this.userSessions.get(userId);
    if (existing && existing.size >= this.maxSessionsPerUser) {
      const oldestSessionId = this.findOldestSession(userId);
      if (oldestSessionId) {
        this.destroySession(oldestSessionId);
      }
    }

    const sessionId = crypto.randomUUID();
    const now = Date.now();

    const session: Session = {
      sessionId,
      userId,
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
      lastActivityAt: now,
      metadata: metadata ?? {},
    };

    this.sessions.set(sessionId, session);

    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    return sessionId;
  }

  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.destroySession(sessionId);
      return null;
    }
    session.lastActivityAt = Date.now();
    return session;
  }

  getUserId(sessionId: string): string | null {
    return this.getSession(sessionId)?.userId ?? null;
  }

  refreshSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.expiresAt = Date.now() + SESSION_DURATION_MS;
    session.lastActivityAt = Date.now();
    return true;
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    const userSet = this.userSessions.get(session.userId);
    if (userSet) {
      userSet.delete(sessionId);
      if (userSet.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }
  }

  destroyAllUserSessions(userId: string): number {
    const userSet = this.userSessions.get(userId);
    if (!userSet) return 0;
    const count = userSet.size;
    for (const sessionId of userSet) {
      this.sessions.delete(sessionId);
    }
    this.userSessions.delete(userId);
    return count;
  }

  getActiveSessionCount(userId: string): number {
    return this.userSessions.get(userId)?.size ?? 0;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
    this.userSessions.clear();
  }

  private findOldestSession(userId: string): string | null {
    const userSet = this.userSessions.get(userId);
    if (!userSet || userSet.size === 0) return null;
    let oldest: Session | null = null;
    for (const sessionId of userSet) {
      const session = this.sessions.get(sessionId);
      if (session && (!oldest || session.createdAt < oldest.createdAt)) {
        oldest = session;
      }
    }
    return oldest?.sessionId ?? null;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions) {
        if (now > session.expiresAt) {
          this.destroySession(sessionId);
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }
}
