import { Router } from "express"
import { logger } from "@repo/logger"
import {
  getAllUsers,
  getUserById,
  getUserByUsername,
  createUser
} from "@repo/db"
import { hashPassword } from "@repo/auth"

const router: Router = Router()

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of all users in the system. Requires authentication.
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       username:
 *                         type: string
 *                         example: "john_doe"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-01-01T00:00:00Z"
 *                 count:
 *                   type: integer
 *                   example: 1
 *       403:
 *         description: Forbidden - requires authentication
 *       500:
 *         description: Failed to retrieve users
 */
router.get("/", async (req, res) => {
  try {
    // In a real implementation, this would require proper authentication
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "Listing users requires authentication in production"
      })
    }

    const allUsers = await getAllUsers()

    return res.json({
      success: true,
      users: allUsers,
      count: allUsers.length
    })

  } catch (error) {
    logger.error({
      message: "Failed to retrieve users",
      error: error
    })
    return res.status(500).json({
      error: "Failed to retrieve users"
    })
  }
})

/**
 * @openapi
 * /api/users/{userId}:
 *   get:
 *     summary: Get a specific user
 *     description: Retrieve information about a specific user by their ID. Requires authentication.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *         description: The ID of the user to retrieve
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: "john_doe"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-01-01T00:00:00Z"
 *       400:
 *         description: Invalid user ID
 *       403:
 *         description: Forbidden - requires authentication
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to retrieve user
 */
router.get("/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)

    if (isNaN(userId)) {
      return res.status(400).json({
        error: "Invalid user ID"
      })
    }

    // In a real implementation, this would require proper authentication
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "Viewing user information requires authentication in production"
      })
    }

    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      })
    }

    return res.json({
      success: true,
      user: user
    })

  } catch (error) {
    logger.error({
      message: "Failed to retrieve user",
      error: error
    })
    return res.status(500).json({
      error: "Failed to retrieve user"
    })
  }
})

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Create a new user
 *     description: Create a new user in the system. Requires authentication in production.
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *                 description: The username for the new user (must be unique)
 *               email:
 *                 type: string
 *                 example: "john@example.com"
 *                 description: The email address for the new user (must be unique)
 *               password:
 *                 type: string
 *                 example: "securePassword123"
 *                 description: The password for the new user (will be hashed)
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: "john_doe"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-01-01T00:00:00Z"
 *                 message:
 *                   type: string
 *                   example: "User created successfully"
 *       400:
 *         description: Username is required or username already exists
 *       403:
 *         description: Forbidden - creating users requires authentication in production
 *       500:
 *         description: Failed to create user
 */
router.post("/", async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || typeof username !== "string" || username.trim() === "") {
      return res.status(400).json({
        error: "Username is required and must be a non-empty string"
      })
    }

    if (!email || typeof email !== "string" || email.trim() === "") {
      return res.status(400).json({
        error: "Email is required and must be a non-empty string"
      })
    }

    if (!password || typeof password !== "string" || password.trim() === "") {
      return res.status(400).json({
        error: "Password is required and must be a non-empty string"
      })
    }

    // In a real implementation, this would require proper authentication
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "Creating users requires authentication in production"
      })
    }

    // Check if username already exists
    const existingUser = await getUserByUsername(username)
    
    if (existingUser) {
      return res.status(400).json({
        error: "Username already exists"
      })
    }

    // Hash the password using the auth package
    const passwordHash = await hashPassword(password)

    // Create new user
    const newUser = await createUser(username, email, passwordHash)

    if (!newUser) {
      return res.status(500).json({
        error: "Failed to create user"
      })
    }

    logger.info({
      message: "User created successfully",
      userId: newUser.id,
      username: newUser.username
    })

    return res.status(201).json({
      success: true,
      user: newUser,
      message: "User created successfully"
    })

  } catch (error) {
    logger.error({
      message: "Failed to create user",
      error: error
    })
    return res.status(500).json({
      error: "Failed to create user"
    })
  }
})

export default router