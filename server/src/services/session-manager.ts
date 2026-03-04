import { randomUUID } from 'crypto';
import { config } from '../config.js';

export interface SyncFileTask {
  versionId: string;
  storagePath: string;
  fileSize: number;
  sha256: string;
  chunkCount: number;
}

export interface SyncSession {
  id: string;
  pending: SyncFileTask[];
  inFlight: SyncFileTask[];
  done: boolean;
  ssePush: ((event: string, data: any) => void) | null;
  createdAt: number;
}

const sessions = new Map<string, SyncSession>();

export function createSession(tasks: SyncFileTask[]): SyncSession {
  const session: SyncSession = {
    id: randomUUID(),
    pending: [...tasks],
    inFlight: [],
    done: tasks.length === 0,
    ssePush: null,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): SyncSession | undefined {
  return sessions.get(sessionId);
}

/** Move tasks from pending → inFlight up to sliding window size, push SSE events */
export function pump(session: SyncSession) {
  while (session.inFlight.length < config.slidingWindow && session.pending.length > 0) {
    const task = session.pending.shift()!;
    session.inFlight.push(task);

    if (session.ssePush) {
      session.ssePush('file_ready', {
        version_id: task.versionId,
        storage_path: task.storagePath,
        file_size: task.fileSize,
        chunk_count: task.chunkCount,
        chunk_size: config.chunkSize,
        sha256: task.sha256,
      });
    }
  }

  if (session.pending.length === 0 && session.inFlight.length === 0) {
    session.done = true;
    if (session.ssePush) {
      session.ssePush('done', {});
    }
  }
}

/** Acknowledge a file download, remove from inFlight, pump next */
export function ack(session: SyncSession, versionId: string): boolean {
  const idx = session.inFlight.findIndex(t => t.versionId === versionId);
  if (idx === -1) return false;
  session.inFlight.splice(idx, 1);
  pump(session);
  return true;
}

export function findTask(session: SyncSession, versionId: string): SyncFileTask | undefined {
  return session.inFlight.find(t => t.versionId === versionId);
}

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > config.sessionTtlMs) {
      sessions.delete(id);
    }
  }
}, config.cleanupIntervalMs);
