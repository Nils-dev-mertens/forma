/**
 * API Key Management Tests
 * Tests for key generation, validation, and management endpoints
 */

const express = require("express");
const request = require("supertest");
const { auth, db } = require("../../utils/test-helper");
const { CheckKey, GenerateKey } = auth;
const { getApiKeyByKey, initializeDatabase } = db;

describe("API Key Management Endpoints", () => {
  let app;
  let validKey;
  
  beforeAll(async () => {
    // Initialize database
    await initializeDatabase();
    
    // Generate a valid key for testing
    validKey = await GenerateKey();
    
    // Create express app with key routes
    app = express();
    app.use(express.json());
    
    // Key generation endpoint
    app.post("/api/key/generate", async (req, res) => {
      try {
        const newKey = await GenerateKey();
        const keyData = await getApiKeyByKey(newKey);
        
        res.status(201).json({
          success: true,
          key: newKey,
          keyId: keyData.id,
          userId: keyData.userId
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Key validation endpoint
    app.post("/api/key/validate", async (req, res) => {
      try {
        const { key } = req.body;
        if (!key) {
          return res.status(400).json({ success: false, error: "Key required" });
        }
        
        const isValid = await CheckKey(key);
        res.json({ success: true, valid: isValid });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  });
  
  describe("POST /api/key/generate", () => {
    it("should generate a new API key", async () => {
      const response = await request(app)
        .post("/api/key/generate")
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.key).toMatch(/^key-[a-f0-9]{64}$/);
      expect(response.body.keyId).toBeGreaterThan(0);
      expect(response.body.userId).toBe(1);
    });
  });
  
  describe("POST /api/key/validate", () => {
    it("should validate correct API keys", async () => {
      const response = await request(app)
        .post("/api/key/validate")
        .send({ key: validKey })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
    });
    
    it("should reject invalid API keys", async () => {
      const response = await request(app)
        .post("/api/key/validate")
        .send({ key: "invalid-key-123456" })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(false);
    });
    
    it("should require key parameter", async () => {
      const response = await request(app)
        .post("/api/key/validate")
        .send({})
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Key required");
    });
  });
});