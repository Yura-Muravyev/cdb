import type { FastifyInstance } from 'fastify';
import { sql } from '../db/index.js';

export async function catalogRoutes(app: FastifyInstance) {
  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // List projects with firmware count
  app.get('/projects', async () => {
    return sql`
      SELECT p.*, COUNT(f.id)::int AS firmware_count
      FROM projects p
      LEFT JOIN firmware f ON f.project_id = p.id
      GROUP BY p.id
      ORDER BY p.name
    `;
  });

  // Single project
  app.get<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const [row] = await sql`SELECT * FROM projects WHERE id = ${req.params.id}`;
    if (!row) return reply.code(404).send({ error: 'Project not found' });
    return row;
  });

  // Firmware for a project with latest release version
  app.get<{ Params: { id: string } }>('/projects/:id/firmware', async (req) => {
    return sql`
      SELECT f.*,
        (
          SELECT json_build_object('id', fv.id, 'version', fv.version, 'created_at', fv.created_at)
          FROM firmware_versions fv
          WHERE fv.firmware_id = f.id AND fv.status = 'release'
          ORDER BY fv.created_at DESC
          LIMIT 1
        ) AS latest_release
      FROM firmware f
      WHERE f.project_id = ${req.params.id}
      ORDER BY f.name
    `;
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
