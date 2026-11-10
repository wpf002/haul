import { randomBytes } from 'node:crypto';
import { buildApp } from './app';
import { loadEnv } from './lib/env';
import { MemoryStore } from './lib/store';

const DEMO_API_PORT = 4000;

/**
 * Demo API with no database: in-memory store, offline catalog, throwaway secrets.
 * Everything resets on restart. loadEnv still refuses DEMO_MODE in production.
 */
const env = loadEnv({
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SESSION_SECRET: randomBytes(48).toString('base64'),
  ...process.env,
  // The web dev server owns PORT when both run together.
  API_PORT: process.env.API_PORT ?? String(DEMO_API_PORT),
  DEMO_MODE: 'true',
});
const app = await buildApp({ env, store: new MemoryStore() });

const close = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

await app.listen({ port: env.API_PORT, host: '127.0.0.1' });
