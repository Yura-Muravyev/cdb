import type { FastifyInstance } from 'fastify';
import { sql } from '../db/index.js';

export async function catalogRoutes(app: FastifyInstance) {
  // Health check
  app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

  // List all firmware
  app.get('/firmware', async () => {
    return sql`
      SELECT f.*,
        (SELECT COUNT(*)::int FROM firmware_versions fv WHERE fv.firmware_id = f.id) AS version_count,
        (
          SELECT json_build_object('id', fv.id, 'version', fv.version, 'created_at', fv.created_at)
          FROM firmware_versions fv
          WHERE fv.firmware_id = f.id AND fv.status = 'release'
          ORDER BY fv.created_at DESC
          LIMIT 1
        ) AS latest_release
      FROM firmware f
      ORDER BY f.name
    `;
  });

  // Single firmware
  app.get<{ Params: { id: string } }>('/firmware/:id', async (req, reply) => {
    const [row] = await sql`SELECT * FROM firmware WHERE id = ${req.params.id}`;
    if (!row) return reply.code(404).send({ error: 'Firmware not found' });
    return row;
  });

  // Versions for a firmware
  app.get<{ Params: { id: string } }>('/firmware/:id/versions', async (req) => {
    return sql`
      SELECT * FROM firmware_versions
      WHERE firmware_id = ${req.params.id}
      ORDER BY created_at DESC
    `;
  });

  // Single version
  app.get<{ Params: { id: string } }>('/versions/:id', async (req, reply) => {
    const [row] = await sql`SELECT * FROM firmware_versions WHERE id = ${req.params.id}`;
    if (!row) return reply.code(404).send({ error: 'Version not found' });
    return row;
  });

  // Change version status
  app.patch<{ Params: { id: string }; Body: { status: string } }>('/versions/:id/status', async (req, reply) => {
    const { status } = req.body;
    if (!['draft', 'release', 'deprecated'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid status. Must be draft, release, or deprecated' });
    }
    const [row] = await sql`
      UPDATE firmware_versions
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return reply.code(404).send({ error: 'Version not found' });
    return row;
  });
}
