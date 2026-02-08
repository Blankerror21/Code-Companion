import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  title: text("title").notNull().default("New Conversation"),
  mode: text("mode").notNull().default("build"),
  replId: text("repl_id"),
  replName: text("repl_name"),
  localProjectPath: text("local_project_path"),
  forkedFrom: varchar("forked_from"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  status: text("status").default("complete"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  lmStudioEndpoint: text("lm_studio_endpoint").notNull().default("https://seismographical-appositely-jaylee.ngrok-free.dev/"),
  modelName: text("model_name").default(""),
  mode: text("mode").notNull().default("build"),
  replitToken: text("replit_token").default(""),
  theme: text("theme").notNull().default("dark"),
  maxTokens: integer("max_tokens").default(4096),
  temperature: text("temperature").default("0.7"),
  dualModelEnabled: boolean("dual_model_enabled").default(false),
  plannerModelName: text("planner_model_name").default(""),
  coderModelName: text("coder_model_name").default(""),
});

export const changeLogs = pgTable("change_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  description: text("description").notNull(),
  filesChanged: jsonb("files_changed"),
  changeType: text("change_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
});

export const insertChangeLogSchema = createInsertSchema(changeLogs).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type ChangeLog = typeof changeLogs.$inferSelect;
export type InsertChangeLog = z.infer<typeof insertChangeLogSchema>;

export const publishedApps = pgTable("published_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: varchar("name").notNull().unique(),
  projectPath: text("project_path").notNull(),
  type: text("type").notNull().default("static"),
  port: integer("port"),
  status: text("status").notNull().default("building"),
  buildLog: text("build_log"),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPublishedAppSchema = createInsertSchema(publishedApps).omit({
  id: true,
  publishedAt: true,
  updatedAt: true,
});

export type PublishedApp = typeof publishedApps.$inferSelect;
export type InsertPublishedApp = z.infer<typeof insertPublishedAppSchema>;
