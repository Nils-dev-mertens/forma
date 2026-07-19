/**
 * Authentication System Tests
 * Tests for API key generation, validation, and middleware integration
 */

const { auth, db } = require("../utils/test-helper");
const { CheckKey, GenerateKey } = auth;
const { initializeDatabase, getApiKeyByKey } = db;

describe("Authentication System", () => {
  
  beforeAll(async () => {
    // Initialize database before tests
    await initializeDatabase();
  });
  
  describe("API Key Generation", () => {
    it("should generate valid API keys", async () => {
      const key = await GenerateKey();
      expect(key).toBeDefined();
      expect(typeof key).toBe("string");
      expect(key).toMatch(/^key-[a-f0-9]{64}$/);
    });

    it("should store generated keys in database", async () => {
      const key = await GenerateKey();
      const dbKey = await getApiKeyByKey(key);
      
      expect(dbKey).toBeDefined();
      expect(dbKey.key).toBe(key);
      expect(dbKey.userId).toBe(1);
      expect(dbKey.hash).toBeTruthy();
    });
  });

  describe("API Key Validation", () => {
    let validKey;
    
    beforeAll(async () => {
      validKey = await GenerateKey();
    });

    it("should validate correct API keys", async () => {
      const isValid = await CheckKey(validKey);
      expect(isValid).toBe(true);
    });

    it("should reject invalid API keys", async () => {
      const isValid = await CheckKey("invalid-key-123456");
      expect(isValid).toBe(false);
    });

    it("should reject empty API keys", async () => {
      const isValid = await CheckKey("");
      expect(isValid).toBe(false);
    });

    it("should reject null API keys", async () => {
      const isValid = await CheckKey(null);
      expect(isValid).toBe(false);
    });
  });

  describe("Database Integration", () => {
    it("should retrieve key data from database", async () => {
      const key = await GenerateKey();
      const dbKey = await getApiKeyByKey(key);
      
      expect(dbKey).toBeDefined();
      expect(dbKey.id).toBeGreaterThan(0);
      expect(dbKey.userId).toBe(1);
      expect(dbKey.createdAt).toBeInstanceOf(Date);
      expect(dbKey.hash).toBeTruthy();
    });

    it("should return null for non-existent keys", async () => {
      const dbKey = await getApiKeyByKey("non-existent-key-123456");
      expect(dbKey).toBeNull();
    });
  });
});