import { randomUUID } from 'node:crypto';
import type { BasketLine, PantryProfile } from '@haul/core';

export type RetailerId = 'kroger' | 'instacart';

export interface PantryRow extends PantryProfile {
  krogerLocationId: string | null;
  modality: 'PICKUP' | 'DELIVERY';
}

export interface LinkRow {
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date;
}

export interface DraftRow {
  id: string;
  userId: string;
  retailer: RetailerId;
  locationId: string | null;
  title: string;
  lines: BasketLine[];
  expiresAt: Date;
}

/** Persistence boundary. Routes depend on this, not on Prisma, so they're testable in memory. */
export interface Store {
  createUser(): Promise<string>;
  createSession(idHash: string, userId: string, expiresAt: Date): Promise<void>;
  getSession(idHash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  deleteSession(idHash: string): Promise<void>;

  getPantry(userId: string): Promise<PantryRow | null>;
  putPantry(userId: string, p: PantryRow): Promise<void>;

  saveOAuthState(s: { state: string; userId: string; verifierEnc: string; returnTo: string | null; expiresAt: Date }): Promise<void>;
  /** Read-once: deletes the row. */
  takeOAuthState(state: string): Promise<{ userId: string; verifierEnc: string; returnTo: string | null; expiresAt: Date } | null>;

  putLink(userId: string, retailer: RetailerId, link: LinkRow): Promise<void>;
  getLink(userId: string, retailer: RetailerId): Promise<LinkRow | null>;
  deleteLink(userId: string, retailer: RetailerId): Promise<void>;

  createDraft(d: Omit<DraftRow, 'id'>): Promise<string>;
  getDraft(id: string, userId: string): Promise<DraftRow | null>;
  deleteDraft(id: string): Promise<void>;
  sweepDrafts(now: Date): Promise<number>;

  logCartEvent(userId: string, retailer: RetailerId, lineCount: number): Promise<void>;
}

export class MemoryStore implements Store {
  users = new Set<string>();
  sessions = new Map<string, { userId: string; expiresAt: Date }>();
  pantries = new Map<string, PantryRow>();
  states = new Map<string, { userId: string; verifierEnc: string; returnTo: string | null; expiresAt: Date }>();
  links = new Map<string, LinkRow>();
  drafts = new Map<string, DraftRow>();
  events: Array<{ userId: string; retailer: RetailerId; lineCount: number }> = [];

  async createUser() {
    const id = randomUUID();
    this.users.add(id);
    return id;
  }
  async createSession(idHash: string, userId: string, expiresAt: Date) {
    this.sessions.set(idHash, { userId, expiresAt });
  }
  async getSession(idHash: string) {
    return this.sessions.get(idHash) ?? null;
  }
  async deleteSession(idHash: string) {
    this.sessions.delete(idHash);
  }
  async getPantry(userId: string) {
    return this.pantries.get(userId) ?? null;
  }
  async putPantry(userId: string, p: PantryRow) {
    this.pantries.set(userId, p);
  }
  async saveOAuthState(s: { state: string; userId: string; verifierEnc: string; returnTo: string | null; expiresAt: Date }) {
    this.states.set(s.state, s);
  }
  async takeOAuthState(state: string) {
    const s = this.states.get(state) ?? null;
    this.states.delete(state);
    return s;
  }
  async putLink(userId: string, retailer: RetailerId, link: LinkRow) {
    this.links.set(`${userId}:${retailer}`, link);
  }
  async getLink(userId: string, retailer: RetailerId) {
    return this.links.get(`${userId}:${retailer}`) ?? null;
  }
  async deleteLink(userId: string, retailer: RetailerId) {
    this.links.delete(`${userId}:${retailer}`);
  }
  async createDraft(d: Omit<DraftRow, 'id'>) {
    const id = randomUUID();
    this.drafts.set(id, { ...d, id });
    return id;
  }
  async getDraft(id: string, userId: string) {
    const d = this.drafts.get(id);
    return d && d.userId === userId && d.expiresAt > new Date() ? d : null;
  }
  async deleteDraft(id: string) {
    this.drafts.delete(id);
  }
  async sweepDrafts(now: Date) {
    let n = 0;
    for (const [id, d] of this.drafts) if (d.expiresAt <= now) (this.drafts.delete(id), n++);
    return n;
  }
  async logCartEvent(userId: string, retailer: RetailerId, lineCount: number) {
    this.events.push({ userId, retailer, lineCount });
  }
}
