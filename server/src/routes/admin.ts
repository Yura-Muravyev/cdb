import type { FastifyInstance } from 'fastify';
import { sql } from '../db/index.js';
import { config } from '../config.js';
import { createHash } from 'crypto';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';

export async function adminRoutes(app: FastifyInstance) {
  // Create project
  app.post<{ Body: { name: string; description?: string } }>('/admin/projects', async (req, reply) => {
    const { name, description } = req.body;
    try {
      const [row] = await sql`
        INSERT INTO projects (name, description) VALUES (${name}, ${description ?? null})
        RETURNING *
      `;
      return reply.code(201).send(row);
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Project already exists' });
      throw err;
    }
  });

  // Create firmware
  app.post<{ Body: { project_id: string; name: string; description?: string } }>('/admin/firmware', async (req, reply) => {
    const { project_id, name, description } = req.body;
    try {
      const [row] = await sql`
        INSERT INTO firmware (project_id, name, description)
        VALUES (${project_id}, ${name}, ${description ?? null})
        RETURNING *
      `;
      return reply.code(201).send(row);
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Firmware already exists for this project' });
      if (err.code === '23503') return reply.code(404).send({ error: 'Project not found' });
      throw err;
    }
  });

  // Upload firmware version — multipart stream to disk, no RAM buffering
  app.post<{ Params: { id: string } }>('/admin/firmware/:id/versions', async (req, reply) => {
    const firmwareId = req.params.id;

    // Verify firmware exists
    const [fw] = await sql`SELECT id FROM firmware WHERE id = ${firmwareId}`;
    if (!fw) return reply.code(404).send({ error: 'Firmware not found' });

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const version = (data.fields.version as any)?.value;
    const author = (data.fields.author as any)?.value;
    const changelog = (data.fields.changelog as any)?.value || null;

    if (!version || !author) {
      return reply.code(400).send({ error: 'version and author are required' });
    }

    // Check duplicate
    const [existing] = await sql`
      SELECT id FROM firmware_versions WHERE firmware_id = ${firmwareId} AND version = ${version}
    `;
    if (existing) return reply.code(409).send({ error: 'Version already exists' });

    const originalName = data.filename;
    const storagePath = join(firmwareId, version, originalName);
    const fullPath = join(config.storageRoot, storagePath);

    await mkdir(join(config.storageRoot, firmwareId, version), { recursive: true });

    // Stream file to disk, compute SHA-256 incrementally
    const hash = createHash('sha256');
    let fileSize = 0;

    const writer = Bun.file(fullPath).writer();
    for await (const chunk of data.file) {
      writer.write(chunk);
      hash.update(chunk);
      fileSize += chunk.length;
    }
    await writer.end();

    const sha256 = hash.digest('hex');

    const [row] = await sql`
      INSERT INTO firmware_versions (firmware_id, version, author, changelog, file_size, sha256, storage_path, original_name)
      VALUES (${firmwareId}, ${version}, ${author}, ${changelog}, ${fileSize}, ${sha256}, ${storagePath}, ${originalName})
      RETURNING *
    `;

    return reply.code(201).send(row);
  });

  // Delete version and file from disk
  app.delete<{ Params: { id: string } }>('/admin/versions/:id', async (req, reply) => {
    const [row] = await sql`
      DELETE FROM firmware_versions WHERE id = ${req.params.id} RETURNING storage_path
    `;
    if (!row) return reply.code(404).send({ error: 'Version not found' });

    try {
      await rm(join(config.storageRoot, row.storage_path), { force: true });
    } catch {
      // File may already be deleted, ignore
    }

    return { deleted: true };
  });
}
