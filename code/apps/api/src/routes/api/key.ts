import { Router } from "express"
import { CheckKey, GenerateKey, hashPassword } from "@repo/auth"
import { logger } from "@repo/logger"
import {
  createApiKey,
  getApiKeysByUserId,
  getApiKeyByKey,
  deleteApiKey,
  updateApiKey,
  getUserById
} from "@repo/db"
import { generateKey, randomBytes } from 'crypto';

const router: Router = Router()

/**
 * @openapi
 * /api/key/generate:
 *   post:
 *     summary: Generate a new API key
 *     description: Generate a new API key for authentication. In development mode, this creates keys for a default user. In production, proper authentication is required.
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 1
 *                 description: The user ID to associate with this API key
 *     responses:
 *       201:
 *         description: API key generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 key:
 *                   type: string
 *                   example: "abc123def456..."
 *                 keyId:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: "API key generated successfully"
 *       403:
 *         description: Forbidden - API key generation requires authentication in production
 *       500:
 *         description: Failed to generate API key
 */
router.post("/generate", async (req, res) => {
  try {
    // In a real implementation, this would require proper user authentication
    // For now, we'll allow key generation in development mode
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "API key generation requires authentication in production"
      })
    }

    const { userId } = req.body;
    
    if (!userId || typeof userId !== "number") {
      return res.status(400).json({
        error: "userId is required and must be a number"
      })
    }

    // Check if the user exists in the database
    const user = await getUserById(userId);
    if (!user) {
      return res.status(400).json({
        error: `User with ID ${userId} does not exist`
      })
    }

    // Generate a new key using crypto directly (avoid GenerateKey which has hardcoded userId)
    const newKey = await GenerateKey();

    // Store the key with the correct userId
    const apiKeyData = await createApiKey({
      userId: userId,
      key: newKey,
      hash: await hashPassword(newKey),
      createdAt: new Date(),
      expiresAt: null // No expiration by default
    })

    logger.info({
      message: "API key generated successfully",
      keyId: apiKeyData.id,
      userId: apiKeyData.userId
    })

    return res.status(201).json({
      success: true,
      key: newKey,
      keyId: apiKeyData.id,
      message: "API key generated successfully"
    })

  } catch (error) {
    logger.error({
      message: "Failed to generate API key",
      error: error
    })
    return res.status(500).json({
      error: "Failed to generate API key"
    })
  }
})

/**
 * @openapi
 * /api/key/validate:
 *   post:
 *     summary: Validate an API key
 *     description: Check if an API key is valid and get information about it.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *                 example: "abc123def456..."
 *                 description: The API key to validate
 *     responses:
 *       200:
 *         description: API key is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 keyInfo:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-01-01T00:00:00Z"
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: null
 *       400:
 *         description: API key is required
 *       403:
 *         description: Invalid API key
 *       500:
 *         description: Failed to validate API key
 */
router.post("/validate", async (req, res) => {
  try {
    const { key } = req.body

    if (!key || typeof key !== "string") {
      return res.status(400).json({
        error: "API key is required"
      })
    }

    // Check if the key is valid using the auth package
    const isValid = await CheckKey(key)

    if (!isValid) {
      return res.status(403).json({
        error: "Invalid API key"
      })
    }

    // Get additional key information from database
    const keyData = await getApiKeyByKey(key)

    return res.json({
      success: true,
      valid: true,
      keyInfo: {
        id: keyData?.id,
        createdAt: keyData?.createdAt,
        expiresAt: keyData?.expiresAt
      }
    })

  } catch (error) {
    logger.error({
      message: "Failed to validate API key",
      error: error
    })
    return res.status(500).json({
      error: "Failed to validate API key"
    })
  }
})

/**
 * @openapi
 * /api/key/list:
 *   get:
 *     summary: List all API keys for a user
 *     description: Retrieve all API keys for the authenticated user. In development mode, returns keys for a default user. In production, proper authentication is required.
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: List of API keys retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 keys:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       userId:
 *                         type: integer
 *                         example: 1
 *                       key:
 *                         type: string
 *                         example: "abc123def..."
 *                         description: Masked API key (first 8 characters only)
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-01-01T00:00:00Z"
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: null
 *                       isExpired:
 *                         type: boolean
 *                         example: false
 *                 count:
 *                   type: integer
 *                   example: 1
 *       403:
 *         description: Forbidden - Listing API keys requires authentication in production
 *       500:
 *         description: Failed to list API keys
 */
router.get("/list", async (req, res) => {
  try {
    // In a real implementation, this would require proper user authentication
    // and would only return keys for the authenticated user
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "Listing API keys requires authentication in production"
      })
    }

    // For development, return all keys for user ID 1
    const keys = await getApiKeysByUserId(1)

    // Mask the actual key values for security
    const maskedKeys = keys.map(key => ({
      id: key.id,
      userId: key.userId,
      key: `${key.key.substring(0, 8)}...`,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      isExpired: key.expiresAt ? new Date(key.expiresAt) < new Date() : false
    }))

    return res.json({
      success: true,
      keys: maskedKeys,
      count: maskedKeys.length
    })

  } catch (error) {
    logger.error({
      message: "Failed to list API keys",
      error: error
    })
    return res.status(500).json({
      error: "Failed to list API keys"
    })
  }
})

/**
 * @openapi
 * /api/key/revoke/{keyId}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Revoke an API key by its ID. The key will no longer be valid for authentication.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *         description: The ID of the API key to revoke
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "API key revoked successfully"
 *       400:
 *         description: Invalid key ID
 *       403:
 *         description: Forbidden - Revoking API keys requires authentication in production
 *       404:
 *         description: API key not found
 *       500:
 *         description: Failed to revoke API key
 */
router.delete("/revoke/:keyId", async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId)

    if (isNaN(keyId)) {
      return res.status(400).json({
        error: "Invalid key ID"
      })
    }

    // In a real implementation, check if the authenticated user owns this key
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "Revocating API keys requires authentication in production"
      })
    }

    // First, get the key to log it before deletion
    const keyToRevoke = await getApiKeyByKey(req.params.keyId)
    
    if (!keyToRevoke) {
      return res.status(404).json({
        error: "API key not found"
      })
    }

    // Revoke the key
    const success = await deleteApiKey(keyId)

    if (!success) {
      return res.status(500).json({
        error: "Failed to revoke API key"
      })
    }

    logger.info({
      message: "API key revoked successfully",
      keyId: keyId,
      key: `${keyToRevoke.key.substring(0, 8)}...`
    })

    return res.json({
      success: true,
      message: "API key revoked successfully"
    })

  } catch (error) {
    logger.error({
      message: "Failed to revoke API key",
      error: error
    })
    return res.status(500).json({
      error: "Failed to revoke API key"
    })
  }
})

/**
 * @openapi
 * /api/key/{keyId}/expire:
 *   patch:
 *     summary: Update API key expiration
 *     description: Update the expiration date of an API key. This allows setting or changing when the key will expire.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *         description: The ID of the API key to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-12-31T23:59:59Z"
 *                 description: The new expiration date for the API key
 *     responses:
 *       200:
 *         description: API key expiration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 key:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-12-31T23:59:59Z"
 *       400:
 *         description: Invalid key ID or expiresAt date
 *       403:
 *         description: Forbidden - Updating API keys requires authentication in production
 *       404:
 *         description: API key not found
 *       500:
 *         description: Failed to update API key expiration
 */
router.patch("/:keyId/expire", async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId)
    const { expiresAt } = req.body

    if (isNaN(keyId)) {
      return res.status(400).json({
        error: "Invalid key ID"
      })
    }

    if (!expiresAt || isNaN(new Date(expiresAt).getTime())) {
      return res.status(400).json({
        error: "Valid expiresAt date is required"
      })
    }

    // In a real implementation, check if the authenticated user owns this key
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "Updating API keys requires authentication in production"
      })
    }

    // Update the key expiration
    const updatedKey = await updateApiKey(keyId, {
      expiresAt: new Date(expiresAt)
    })

    if (!updatedKey) {
      return res.status(404).json({
        error: "API key not found"
      })
    }

    logger.info({
      message: "API key expiration updated",
      keyId: keyId,
      expiresAt: expiresAt
    })

    return res.json({
      success: true,
      key: {
        id: updatedKey.id,
        expiresAt: updatedKey.expiresAt
      }
    })

  } catch (error) {
    logger.error({
      message: "Failed to update API key expiration",
      error: error
    })
    return res.status(500).json({
      error: "Failed to update API key expiration"
    })
  }
})

export default router