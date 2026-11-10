import type { BasketLine } from '@haul/core';
import { type PrismaClient, Prisma } from '@haul/db';
import type { DraftRow, LinkRow, PantryRow, RetailerId, Store } from './store';

export class PrismaStore implements Store {
  constructor(private readonly db: PrismaClient) {}

  async createUser() {
    return (await this.db.user.create({ data: {} })).id;
  }
  async createSession(idHash: string, userId: string, expiresAt: Date) {
    await this.db.session.create({ data: { idHash, userId, expiresAt } });
  }
  async getSession(idHash: string) {
    return this.db.session.findUnique({ where: { idHash }, select: { userId: true, expiresAt: true } });
  }
  async deleteSession(idHash: string) {
    await this.db.session.deleteMany({ where: { idHash } });
  }

  async getPantry(userId: string): Promise<PantryRow | null> {
    const p = await this.db.pantry.findUnique({ where: { userId } });
    if (!p) return null;
    return {
      staples: p.staples,
      dislikes: p.dislikes,
      preferStoreBrand: p.preferStoreBrand,
      preferOrganic: p.preferOrganic,
      brandPrefs: (p.brandPrefs ?? {}) as Record<string, string>,
      krogerLocationId: p.krogerLocationId,
      modality: p.modality,
    };
  }
  async putPantry(userId: string, p: PantryRow) {
    const data = { ...p, brandPrefs: p.brandPrefs as Prisma.InputJsonObject };
    await this.db.pantry.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }

  async saveOAuthState(s: { state: string; userId: string; verifierEnc: string; returnTo: string | null; expiresAt: Date }) {
    await this.db.oAuthState.create({ data: s });
  }
  async takeOAuthState(state: string) {
    try {
      return await this.db.oAuthState.delete({ where: { state } });
    } catch {
      return null;
    }
  }

  async putLink(userId: string, retailer: RetailerId, link: LinkRow) {
    await this.db.retailerLink.upsert({
      where: { userId_retailer: { userId, retailer } },
      create: { userId, retailer, ...link },
      update: link,
    });
  }
  async getLink(userId: string, retailer: RetailerId) {
    return this.db.retailerLink.findUnique({
      where: { userId_retailer: { userId, retailer } },
      select: { accessTokenEnc: true, refreshTokenEnc: true, expiresAt: true },
    });
  }
  async deleteLink(userId: string, retailer: RetailerId) {
    await this.db.retailerLink.deleteMany({ where: { userId, retailer } });
  }

  async createDraft(d: Omit<DraftRow, 'id'>) {
    const row = await this.db.basketDraft.create({
      data: {
        userId: d.userId,
        retailer: d.retailer,
        locationId: d.locationId,
        title: d.title,
        payload: d.lines as unknown as Prisma.InputJsonArray,
        expiresAt: d.expiresAt,
      },
    });
    return row.id;
  }
  async getDraft(id: string, userId: string): Promise<DraftRow | null> {
    const d = await this.db.basketDraft.findFirst({ where: { id, userId, expiresAt: { gt: new Date() } } });
    if (!d) return null;
    return { id: d.id, userId: d.userId, retailer: d.retailer, locationId: d.locationId, title: d.title, lines: d.payload as unknown as BasketLine[], expiresAt: d.expiresAt };
  }
  async deleteDraft(id: string) {
    await this.db.basketDraft.deleteMany({ where: { id } });
  }
  async sweepDrafts(now: Date) {
    const [drafts] = await this.db.$transaction([
      this.db.basketDraft.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.db.oAuthState.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.db.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    ]);
    return drafts.count;
  }

  async logCartEvent(userId: string, retailer: RetailerId, lineCount: number) {
    await this.db.cartEvent.create({ data: { userId, retailer, lineCount } });
  }
}
