import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Railway injects PORT.
  API_PORT: z.coerce.number().default(Number(process.env.PORT ?? 4000)),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  TOKEN_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64'),
  SESSION_SECRET: z.string().min(32),
  DATABASE_URL: z.string().optional(),
  KROGER_CLIENT_ID: z.string().default(''),
  KROGER_CLIENT_SECRET: z.string().default(''),
  KROGER_REDIRECT_URI: z.string().url().default('http://localhost:4000/auth/kroger/callback'),
  KROGER_API_BASE: z.string().url().default('https://api.kroger.com/v1'),
  INSTACART_API_KEY: z.string().default(''),
  INSTACART_API_BASE: z.string().url().default('https://connect.dev.instacart.tools'),
  INSTACART_LINKBACK_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().default(''),
  RERANK_MODEL: z.string().default('claude-haiku-5-5'),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    // Name the bad keys, never echo values.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${keys}`);
  }
  return parsed.data;
}
