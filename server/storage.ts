import {
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Settings,
  type InsertSettings,
  type ChangeLog,
  type InsertChangeLog,
  type PublishedApp,
  type InsertPublishedApp,
  conversations,
  messages,
  settings,
  changeLogs,
  publishedApps,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  getConversations(userId?: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conv: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;

  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<Message>;

  getSettings(): Promise<Settings>;
  updateSettings(data: Partial<InsertSettings>): Promise<Settings>;

  getConversationsByProjectPath(projectPath: string, excludeConversationId?: string): Promise<Conversation[]>;

  getChangeLogs(): Promise<ChangeLog[]>;
  createChangeLog(log: InsertChangeLog): Promise<ChangeLog>;

  getPublishedApps(userId?: string): Promise<PublishedApp[]>;
  getPublishedApp(id: string): Promise<PublishedApp | undefined>;
  getPublishedAppByName(name: string): Promise<PublishedApp | undefined>;
  createPublishedApp(app: InsertPublishedApp): Promise<PublishedApp>;
  updatePublishedApp(id: string, data: Partial<InsertPublishedApp>): Promise<PublishedApp | undefined>;
  deletePublishedApp(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getConversations(userId?: string): Promise<Conversation[]> {
    if (userId) {
      return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
    }
    return db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv || undefined;
  }

  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const [created] = await db.insert(conversations).values(conv).returning();
    return created;
  }

  async updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const [updated] = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(msg: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(msg).returning();
    return created;
  }

  async getSettings(): Promise<Settings> {
    const [existing] = await db.select().from(settings);
    if (existing) return existing;
    const [created] = await db
      .insert(settings)
      .values({
        id: 1,
        lmStudioEndpoint: "https://seismographical-appositely-jaylee.ngrok-free.dev/",
        mode: "build",
        theme: "dark",
      })
      .returning();
    return created;
  }

  async updateSettings(data: Partial<InsertSettings>): Promise<Settings> {
    const existing = await this.getSettings();
    const [updated] = await db
      .update(settings)
      .set(data)
      .where(eq(settings.id, existing.id))
      .returning();
    return updated;
  }

  async getConversationsByProjectPath(projectPath: string, excludeConversationId?: string): Promise<Conversation[]> {
    if (excludeConversationId) {
      return db.select().from(conversations).where(
        and(
          eq(conversations.localProjectPath, projectPath),
          // exclude the given conversation
          // drizzle doesn't have neq, so we use a raw filter after
        )
      ).then(rows => rows.filter(r => r.id !== excludeConversationId));
    }
    return db.select().from(conversations).where(eq(conversations.localProjectPath, projectPath));
  }

  async getChangeLogs(): Promise<ChangeLog[]> {
    return db.select().from(changeLogs).orderBy(desc(changeLogs.createdAt));
  }

  async createChangeLog(log: InsertChangeLog): Promise<ChangeLog> {
    const [created] = await db.insert(changeLogs).values(log).returning();
    return created;
  }

  async getPublishedApps(userId?: string): Promise<PublishedApp[]> {
    if (userId) {
      return db.select().from(publishedApps).where(eq(publishedApps.userId, userId)).orderBy(desc(publishedApps.updatedAt));
    }
    return db.select().from(publishedApps).orderBy(desc(publishedApps.updatedAt));
  }

  async getPublishedApp(id: string): Promise<PublishedApp | undefined> {
    const [app] = await db.select().from(publishedApps).where(eq(publishedApps.id, id));
    return app || undefined;
  }

  async getPublishedAppByName(name: string): Promise<PublishedApp | undefined> {
    const [app] = await db.select().from(publishedApps).where(eq(publishedApps.name, name));
    return app || undefined;
  }

  async createPublishedApp(app: InsertPublishedApp): Promise<PublishedApp> {
    const [created] = await db.insert(publishedApps).values(app).returning();
    return created;
  }

  async updatePublishedApp(id: string, data: Partial<InsertPublishedApp>): Promise<PublishedApp | undefined> {
    const [updated] = await db
      .update(publishedApps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(publishedApps.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePublishedApp(id: string): Promise<void> {
    await db.delete(publishedApps).where(eq(publishedApps.id, id));
  }
}

export const storage = new DatabaseStorage();
