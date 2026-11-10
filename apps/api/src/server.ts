import { prisma } from '@haul/db';
import { buildApp } from './app';
import { loadEnv } from './lib/env';
import { PrismaStore } from './lib/prisma-store';

const env = loadEnv();
const app = await buildApp({ env, store: new PrismaStore(prisma) });

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
