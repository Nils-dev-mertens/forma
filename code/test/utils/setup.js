/**
 * Test Setup Utilities
 * Initializes database and other test dependencies
 */

const { db } = require("./test-helper");
const { initializeDatabase } = db;

// Initialize database before tests
beforeAll(async () => {
  try {
    await initializeDatabase();
    console.log("✅ Database initialized for tests");
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
    process.exit(1);
  }
});

// Clean up after tests
afterAll(async () => {
  // Add cleanup logic here if needed
});

// Export test utilities
module.exports = {
  setupDatabase: initializeDatabase
};