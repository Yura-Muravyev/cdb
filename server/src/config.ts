export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'firmware_hub',
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? 'postgres',
  },
  storageRoot: process.env.STORAGE_ROOT ?? './storage',
  chunkSize: 64 * 1024 * 1024, // 64 MB
  slidingWindow: 3,
  sessionTtlMs: 30 * 60 * 1000, // 30 min
  cleanupIntervalMs: 5 * 60 * 1000, // 5 min
  heartbeatIntervalMs: 15 * 1000, // 15 sec
} as const;
