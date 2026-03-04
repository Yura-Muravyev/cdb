import { sql } from './index.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dir, '../../migrations');

async function migrate() {
  // Create migrations tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Get already applied migrations
  const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY id`;
  const appliedSet = new Set(applied.map(r => r.name));

  // Read migration files
  const files = (await import('fs')).readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip: ${file}`);
      continue;
    }
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`  apply: ${file}`);
    await sql.unsafe(content);
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  }

  console.log('Migrations complete.');
  await sql.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
