import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Profiles table - one identity profile per user.
export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  displayName: text('display_name'),
  tagline: text('tagline'),
  brandColors: text('brand_colors').notNull(),
  logo: text('logo'),
  socialLinks: text('social_links').notNull(),
  customData: text('custom_data').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// API Keys table
export const apiKeys = sqliteTable('api_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  key: text('key').notNull().unique(),
  hash: text('hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
});

// Application data table (replacing the mock getData function)
export const appData = sqliteTable('app_data', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Templates table
export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull().unique(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Sets table - a configurable collection of dynamic entries.
// fields:    JSON array of { fieldname, type, required? } field declarations.
// templates: JSON array of template names attached to the set (>=1 enforced at API layer).
// triggers:  JSON object { add: TriggerAction[], modify: TriggerAction[] }.
export const sets = sqliteTable(
  'sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    description: text('description'),
    fields: text('fields').notNull(),
    templates: text('templates').notNull(),
    triggers: text('triggers').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
  },
  (table) => ({
    userIdNameIdx: index('sets_user_id_name_idx').on(table.userId, table.name),
  }),
);

// Entries table - one row per record; flexible JSON data column.
export const entries = sqliteTable(
  'entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    setId: integer('set_id').notNull().references(() => sets.id),
    data: text('data').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
  },
  (table) => ({
    setIdIdx: index('entries_set_id_idx').on(table.setId),
  }),
);

// Images table
export const images = sqliteTable('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  templateId: integer('template_id').references(() => templates.id),
  entryId: integer('entry_id'), // nullable: legacy images are not linked to any entry
  name: text('name').notNull().unique(),
  generationData: text('generation_data'), // JSON with generation parameters
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// AI provider keys table - encrypted user-provided API keys.
export const aiKeys = sqliteTable('ai_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  provider: text('provider').notNull().default('openai'),
  encryptedKey: text('encrypted_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// AI chat sessions table - keeps context across requests.
export const aiSessions = sqliteTable('ai_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contextTemplateName: text('context_template_name'), // existing template being edited, if any
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// AI chat messages table - persisted history for a session.
export const aiMessages = sqliteTable('ai_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => aiSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// AI response log table - audit trail of provider calls (request + response).
export const aiLogs = sqliteTable('ai_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: integer('session_id').references(() => aiSessions.id, { onDelete: 'set null' }),
  provider: text('provider').notNull().default('openai'),
  model: text('model').notNull().default(''),
  system: text('system'), // system prompt sent to the provider
  prompt: text('prompt'), // user prompt sent to the provider
  response: text('response'), // raw provider response
  status: text('status').notNull().default('success'), // 'success' | 'error'
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  apiKeys: many(apiKeys),
  appData: many(appData),
  templates: many(templates),
  images: many(images),
  sets: many(sets),
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const setsRelations = relations(sets, ({ one, many }) => ({
  user: one(users, {
    fields: [sets.userId],
    references: [users.id],
  }),
  entries: many(entries),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
  set: one(sets, {
    fields: [entries.setId],
    references: [sets.id],
  }),
  images: many(images),
}));

export const appDataRelations = relations(appData, ({ one }) => ({
  user: one(users, {
    fields: [appData.userId],
    references: [users.id],
  }),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  user: one(users, {
    fields: [templates.userId],
    references: [users.id],
  }),
  images: many(images),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  user: one(users, {
    fields: [images.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [images.templateId],
    references: [templates.id],
  }),
  entry: one(entries, {
    fields: [images.entryId],
    references: [entries.id],
  }),
}));

export const aiKeysRelations = relations(aiKeys, ({ one }) => ({
  user: one(users, {
    fields: [aiKeys.userId],
    references: [users.id],
  }),
}));

export const aiSessionsRelations = relations(aiSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [aiSessions.userId],
    references: [users.id],
  }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  session: one(aiSessions, {
    fields: [aiMessages.sessionId],
    references: [aiSessions.id],
  }),
}));

export const aiLogsRelations = relations(aiLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiLogs.userId],
    references: [users.id],
  }),
  session: one(aiSessions, {
    fields: [aiLogs.sessionId],
    references: [aiSessions.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type AppData = typeof appData.$inferSelect;
export type NewAppData = typeof appData.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type AiKey = typeof aiKeys.$inferSelect;
export type NewAiKey = typeof aiKeys.$inferInsert;
export type AiSession = typeof aiSessions.$inferSelect;
export type NewAiSession = typeof aiSessions.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
export type AiLog = typeof aiLogs.$inferSelect;
export type NewAiLog = typeof aiLogs.$inferInsert;