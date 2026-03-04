import type { FastifyInstance } from 'fastify';
import { sql } from '../db/index.js';
import { config } from '../config.js';
import { join } from 'path';
import {
  createSession,
  getSession,
  pump,
  ack,
  findTask,
  type SyncFileTask,
} from '../services/session-manager.js';

export async function syncRoutes(app: FastifyInstance) {
  // POST /sync/start — create sync session
  app.post<{
    Body: Array<{ version_id: string; sha256: string | null }>;
  }>('/sync/start', async (req) => {
    const requested = req.body;

    // Fetch all requested versions from DB
    const versionIds = requested.map(r => r.version_id);
    const rows = await sql`
      SELECT id, firmware_id, version, file_size, sha256, storage_path, status
      FROM firmware_versions
      WHERE id = ANY(${versionIds})
    `;

    const dbMap = new Map(rows.map((r: any) => [r.id, r]));
    const tasks: SyncFileTask[] = [];

    for (const item of requested) {
      const dbRow = dbMap.get(item.version_id);
      if (!dbRow) continue;
      if (dbRow.status === 'deprecated') continue;
      // Skip if client already has the correct hash
      if (item.sha256 && item.sha256 === dbRow.sha256) continue;

      tasks.push({
        versionId: dbRow.id,
        storagePath: dbRow.storage_path,
        fileSize: Number(dbRow.file_size),
        sha256: dbRow.sha256,
        chunkCount: Math.ceil(Number(dbRow.file_size) / config.chunkSize),
      });
    }

    const session = createSession(tasks);
    return { session_id: session.id, to_sync: tasks.length };
  });

  // GET /sync/:sessionId/stream — SSE channel
  app.get<{ Params: { sessionId: string } }>('/sync/:sessionId/stream', async (req, reply) => {
    const session = getSession(req.params.sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const push = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    session.ssePush = push;

    // Heartbeat
    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, config.heartbeatIntervalMs);

    // Initial pump
    pump(session);

    // If already done (empty session)
    if (session.done) {
      push('done', {});
    }

    // Clean up on close
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      session.ssePush = null;
    });
  });

  // GET /sync/:sessionId/chunk/:versionId/:n — binary chunk
  app.get<{
    Params: { sessionId: string; versionId: string; n: string };
  }>('/sync/:sessionId/chunk/:versionId/:n', async (req, reply) => {
    const session = getSession(req.params.sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const task = findTask(session, req.params.versionId);
    if (!task) return reply.code(404).send({ error: 'File not in flight' });

    const chunkIndex = parseInt(req.params.n, 10);
    if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= task.chunkCount) {
      return reply.code(400).send({ error: 'Invalid chunk index' });
    }

    const offset = chunkIndex * config.chunkSize;
    const end = Math.min(offset + config.chunkSize, task.fileSize);
    const fullPath = join(config.storageRoot, task.storagePath);

    // Zero-copy slice via Bun.file()
    const fileSlice = Bun.file(fullPath).slice(offset, end);

    reply.raw.writeHead(206, {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${offset}-${end - 1}/${task.fileSize}`,
      'Content-Length': String(end - offset),
      'X-Version-Id': task.versionId,
      'X-Chunk-Index': String(chunkIndex),
      'X-Chunk-Count': String(task.chunkCount),
      'X-File-Sha256': task.sha256,
    });

    const stream = fileSlice.stream();
    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }
    } finally {
      reply.raw.end();
    }
  });

  // POST /sync/:sessionId/ack — acknowledge file download
  app.post<{
    Params: { sessionId: string };
    Body: { version_id: string };
  }>('/sync/:sessionId/ack', async (req, reply) => {
    const session = getSession(req.params.sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const ok = ack(session, req.body.version_id);
    if (!ok) return reply.code(400).send({ error: 'Version not in flight' });

    return { ok: true };
  });
}
