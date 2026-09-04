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
// hooks:     JSON array of export destinations fired after rendering (webhook/email).
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
    hooks: text('hooks'),
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
  model: text('model'), // selected model for this session; null = use AI_DEFAULT_MODEL
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
  inputTokens: integer('input_tokens'), // tokens in the prompt
  outputTokens: integer('output_tokens'), // tokens in the completion
  totalTokens: integer('total_tokens'), // input + output
  status: text('status').notNull().default('success'), // 'success' | 'error'
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Workflow canvas tables - visual node graph replacing triggers/hooks JSON.
export const workflowNodes = sqliteTable('workflow_nodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  setId: integer('set_id').notNull().references(() => sets.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(), // React Flow node ID (e.g. "node_1")
  type: text('type').notNull(), // "record" | "template" | "destination" | "delete"
  label: text('label'), // display name (e.g. template name)
  positionX: integer('position_x').notNull().default(0),
  positionY: integer('position_y').notNull().default(0),
  config: text('config').notNull().default('{}'), // JSON: type-specific config (templateId, dimensions, destination type, etc.)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
}, (table) => ({
  setIdIdx: index('workflow_nodes_set_id_idx').on(table.setId),
}));

export const workflowEdges = sqliteTable('workflow_edges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  setId: integer('set_id').notNull().references(() => sets.id, { onDelete: 'cascade' }),
  edgeId: text('edge_id').notNull(), // React Flow edge ID
  sourceNodeId: text('source_node_id').notNull(), // references workflowNodes.nodeId
  targetNodeId: text('target_node_id').notNull(),
  sourceHandle: text('source_handle'), // "new" | "edited" | "output" for Record nodes
  targetHandle: text('target_handle'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
}, (table) => ({
  setIdIdx: index('workflow_edges_set_id_idx').on(table.setId),
}));

// Workflow run history - latest run per workflow, replaced on next run.
export const workflowRuns = sqliteTable('workflow_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  setId: integer('set_id').notNull().references(() => sets.id, { onDelete: 'cascade' }).unique(),
  entryId: integer('entry_id').references(() => entries.id),
  event: text('event').notNull(), // "add" | "modify" | "delete"
  status: text('status').notNull().default('running'), // "running" | "success" | "partial" | "failed"
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().default(new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (table) => ({
  setIdIdx: index('workflow_runs_set_id_idx').on(table.setId),
}));

// Per-node execution results within a run.
export const workflowNodeResults = sqliteTable('workflow_node_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(), // references workflowNodes.nodeId
  type: text('type').notNull(), // "record" | "template" | "destination" | "delete"
  status: text('status').notNull().default('pending'), // "pending" | "running" | "success" | "failed" | "skipped"
  payload: text('payload'), // JSON: input data sent to this node
  response: text('response'), // JSON: output/result from this node
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (table) => ({
  runIdIdx: index('workflow_node_results_run_id_idx').on(table.runId),
}));

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
  workflowNodes: many(workflowNodes),
  workflowEdges: many(workflowEdges),
  workflowRun: one(workflowRuns),
}));

export const workflowNodesRelations = relations(workflowNodes, ({ one }) => ({
  set: one(sets, {
    fields: [workflowNodes.setId],
    references: [sets.id],
  }),
}));

export const workflowEdgesRelations = relations(workflowEdges, ({ one }) => ({
  set: one(sets, {
    fields: [workflowEdges.setId],
    references: [sets.id],
  }),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
  set: one(sets, {
    fields: [workflowRuns.setId],
    references: [sets.id],
  }),
  entry: one(entries, {
    fields: [workflowRuns.entryId],
    references: [entries.id],
  }),
  nodeResults: many(workflowNodeResults),
}));

export const workflowNodeResultsRelations = relations(workflowNodeResults, ({ one }) => ({
  run: one(workflowRuns, {
    fields: [workflowNodeResults.runId],
    references: [workflowRuns.id],
  }),
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
export type WorkflowNode = typeof workflowNodes.$inferSelect;
export type NewWorkflowNode = typeof workflowNodes.$inferInsert;
export type WorkflowEdge = typeof workflowEdges.$inferSelect;
export type NewWorkflowEdge = typeof workflowEdges.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowNodeResult = typeof workflowNodeResults.$inferSelect;
export type NewWorkflowNodeResult = typeof workflowNodeResults.$inferInsert;