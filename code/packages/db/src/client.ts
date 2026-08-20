import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema.ts';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Database file path: allow tests and other environments to override it.
// Falls back to code/db.sqlite relative to this package.
function resolveDbPath(): string {
  const envPath = process.env.FORMA_DB_PATH;
  if (!envPath) return resolve(__dirname, '../../../db.sqlite');
  // Pass through SQLite special names unchanged; otherwise resolve relative to
  // the process working directory.
  if (envPath === ":memory:" || envPath.startsWith("file:")) return envPath;
  return resolve(process.cwd(), envPath);
}

const dbPath = resolveDbPath();

// Initialize SQLite database
const sqlite = new Database(dbPath);

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Run migrations automatically when the client is imported
export async function initializeDatabase() {
  try {
    // Create tables if they don't exist (simple approach)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        onboarding_completed INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate: add onboarding_completed column to existing users table
    try {
      const existingUserColumns = sqlite
        .query("PRAGMA table_info(users)")
        .all() as Array<{ name: string }>;
      const hasOnboardingCompleted = existingUserColumns.some((c) => c.name === "onboarding_completed");
      if (!hasOnboardingCompleted) {
        db.run(`ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;`);
        console.log("Added users.onboarding_completed column");
      }
    } catch (error) {
      console.warn("Could not migrate users.onboarding_completed:", error);
    }
    
    db.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL UNIQUE,
        hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS app_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    
    // Create templates table
    db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Create images table
    db.run(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        template_id INTEGER,
        entry_id INTEGER,
        name TEXT NOT NULL UNIQUE,
        generation_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (template_id) REFERENCES templates(id)
      );
    `);

    // Migrate: add entry_id column to existing images table
    try {
      const existingColumns = sqlite
        .query("PRAGMA table_info(images)")
        .all() as Array<{ name: string }>;
      const hasEntryId = existingColumns.some((c) => c.name === "entry_id");
      if (!hasEntryId) {
        db.run(`ALTER TABLE images ADD COLUMN entry_id INTEGER;`);
      }
    } catch (error) {
      console.warn("Could not migrate images.entry_id:", error);
    }

    // Create sets table
    db.run(`
      CREATE TABLE IF NOT EXISTS sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        fields TEXT NOT NULL,
        templates TEXT NOT NULL,
        triggers TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE (user_id, name)
      );
    `);

    // Migrate: drop the obsolete dimensions column from existing sets table
    try {
      const existingSetColumns = sqlite
        .query("PRAGMA table_info(sets)")
        .all() as Array<{ name: string }>;
      const hasDimensions = existingSetColumns.some((c) => c.name === "dimensions");
      if (hasDimensions) {
        db.run(`ALTER TABLE sets DROP COLUMN dimensions;`);
        console.log("Dropped obsolete sets.dimensions column");
      }
    } catch (error) {
      console.warn("Could not drop sets.dimensions:", error);
    }

    db.run(
      `CREATE INDEX IF NOT EXISTS sets_user_id_name_idx ON sets (user_id, name);`,
    );

    // Create profiles table
    db.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        display_name TEXT,
        tagline TEXT,
        brand_colors TEXT NOT NULL DEFAULT '{}',
        logo TEXT,
        social_links TEXT NOT NULL DEFAULT '{}',
        custom_data TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Migrate: rename title -> tagline and drop the obsolete company column
    // from existing profiles tables.
    try {
      const existingProfileColumns = sqlite
        .query("PRAGMA table_info(profiles)")
        .all() as Array<{ name: string }>;
      const hasTagline = existingProfileColumns.some((c) => c.name === "tagline");
      const hasTitle = existingProfileColumns.some((c) => c.name === "title");
      const hasCompany = existingProfileColumns.some((c) => c.name === "company");
      if (hasTitle && !hasTagline) {
        db.run(`ALTER TABLE profiles RENAME COLUMN title TO tagline;`);
        console.log("Migrated profiles.title to profiles.tagline");
      }
      if (hasCompany) {
        db.run(`ALTER TABLE profiles DROP COLUMN company;`);
        console.log("Dropped obsolete profiles.company column");
      }
    } catch (error) {
      console.warn("Could not migrate profiles.title/company:", error);
    }

    // Migrate: create a profile for every existing user that does not have one.
    try {
      const backfill = db.run(`
        INSERT INTO profiles (user_id, display_name, brand_colors, logo, social_links, custom_data, created_at, updated_at)
        SELECT u.id, NULL, '{}', NULL, '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE p.id IS NULL;
      `);
      // @ts-ignore - changes property exists on the result
      const inserted = (backfill as any).changes ?? 0;
      if (inserted > 0) {
        console.log(`Backfilled ${inserted} missing profile(s)`);
      }
    } catch (error) {
      console.warn("Could not backfill missing profiles:", error);
    }

    // Create entries table
    db.run(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (set_id) REFERENCES sets(id)
      );
    `);

    db.run(
      `CREATE INDEX IF NOT EXISTS entries_set_id_idx ON entries (set_id);`,
    );

    // Create AI keys table
    db.run(`
      CREATE TABLE IF NOT EXISTS ai_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL DEFAULT 'openai',
        encrypted_key TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id)
      );
    `);

    // Create AI sessions table
    db.run(`
      CREATE TABLE IF NOT EXISTS ai_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        context_template_name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Create AI messages table
    db.run(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
      );
    `);

    db.run(
      `CREATE INDEX IF NOT EXISTS ai_messages_session_id_idx ON ai_messages(session_id);`,
    );

    // Create AI response log table
    db.run(`
      CREATE TABLE IF NOT EXISTS ai_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id INTEGER,
        provider TEXT NOT NULL DEFAULT 'openai',
        model TEXT NOT NULL DEFAULT '',
        system TEXT,
        prompt TEXT,
        response TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        error TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE SET NULL
      );
    `);

    db.run(`CREATE INDEX IF NOT EXISTS ai_logs_user_id_idx ON ai_logs(user_id);`);

    console.log('Database initialized and tables created');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Export schema for direct access if needed
export * from './schema.ts';

export type DbClient = typeof db;