/**
 * Database Operations Tests
 * Tests for CRUD operations on API keys
 */

const { db } = require("../utils/test-helper");
const { 
  initializeDatabase, 
  createApiKey, 
  getApiKeyByKey, 
  getApiKeyById, 
  updateApiKey, 
  deleteApiKey, 
  getApiKeysByUserId 
} = db;

describe("Database Operations", () => {
  
  beforeAll(async () => {
    await initializeDatabase();
  });
  
  describe("CREATE Operations", () => {
    it("should create a new API key", async () => {
      const newKey = {
        userId: 1,
        key: "test-key-123456",
        hash: "test-hash-789",
        createdAt: new Date(),
        expiresAt: null
      };
      
      const createdKey = await createApiKey(newKey);
      
      expect(createdKey).toBeDefined();
      expect(createdKey.id).toBeGreaterThan(0);
      expect(createdKey.userId).toBe(1);
      expect(createdKey.key).toBe("test-key-123456");
    });
  });

  describe("READ Operations", () => {
    let testKeyId;
    
    beforeAll(async () => {
      const newKey = {
        userId: 1,
        key: "test-read-key",
        hash: "test-read-hash",
        createdAt: new Date(),
        expiresAt: null
      };
      const created = await createApiKey(newKey);
      testKeyId = created.id;
    });

    it("should get API key by ID", async () => {
      const key = await getApiKeyById(testKeyId);
      expect(key).toBeDefined();
      expect(key.id).toBe(testKeyId);
      expect(key.key).toBe("test-read-key");
    });

    it("should get API key by key value", async () => {
      const key = await getApiKeyByKey("test-read-key");
      expect(key).toBeDefined();
      expect(key.id).toBe(testKeyId);
      expect(key.userId).toBe(1);
    });

    it("should get API keys by user ID", async () => {
      const keys = await getApiKeysByUserId(1);
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
      
      const testKey = keys.find(k => k.key === "test-read-key");
      expect(testKey).toBeDefined();
    });
  });

  describe("UPDATE Operations", () => {
    let testKeyId;
    
    beforeAll(async () => {
      const newKey = {
        userId: 1,
        key: "test-update-key",
        hash: "test-update-hash",
        createdAt: new Date(),
        expiresAt: null
      };
      const created = await createApiKey(newKey);
      testKeyId = created.id;
    });

    it("should update API key expiration", async () => {
      const expiresAt = new Date(Date.now() + 86400000); // Tomorrow
      
      const updatedKey = await updateApiKey(testKeyId, { expiresAt });
      
      expect(updatedKey).toBeDefined();
      expect(updatedKey.id).toBe(testKeyId);
      expect(updatedKey.expiresAt).toBeDefined();
    });
  });

  describe("DELETE Operations", () => {
    let testKeyId;
    
    beforeAll(async () => {
      const newKey = {
        userId: 1,
        key: "test-delete-key",
        hash: "test-delete-hash",
        createdAt: new Date(),
        expiresAt: null
      };
      const created = await createApiKey(newKey);
      testKeyId = created.id;
    });

    it("should delete API key", async () => {
      const success = await deleteApiKey(testKeyId);
      expect(success).toBe(true);
      
      const deletedKey = await getApiKeyById(testKeyId);
      expect(deletedKey).toBeNull();
    });

    it("should return false for non-existent key", async () => {
      const success = await deleteApiKey(999999);
      expect(success).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent keys gracefully", async () => {
      const nonExistent = await getApiKeyById(999999);
      expect(nonExistent).toBeNull();
      
      const nonExistentByKey = await getApiKeyByKey("non-existent-key");
      expect(nonExistentByKey).toBeNull();
    });
  });
});