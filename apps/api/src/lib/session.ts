import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomId, sha256 } from './crypto';
import type { Store } from './store';

export const SESSION_COOKIE = 'haul_sid';
const TTL_MS = 30 * 24 * 3600 * 1000;

/**
 * Anonymous-first sessions: a user row is created on first visit so pantry
 * settings and the Kroger link have an owner. The cookie holds a random id;
 * the DB stores only its hash.
 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply, store: Store, secure: boolean): Promise<string> {
  const raw = req.cookies[SESSION_COOKIE];
  const unsigned = raw ? req.unsignCookie(raw) : null;
  if (unsigned?.valid && unsigned.value) {
    const s = await store.getSession(sha256(unsigned.value));
    if (s && s.expiresAt > new Date()) return s.userId;
  }
  const userId = await store.createUser();
  const sid = randomId();
  await store.createSession(sha256(sid), userId, new Date(Date.now() + TTL_MS));
  reply.setCookie(SESSION_COOKIE, sid, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    signed: true,
    maxAge: TTL_MS / 1000,
  });
  return userId;
}
