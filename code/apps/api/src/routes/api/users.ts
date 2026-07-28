import { Router } from "express"
import { logger } from "@repo/logger"
import {
  getAllUsers,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  createUser,
  getProfileByUserId,
  updateProfile,
  type User,
  type Profile,
  decodeProfileBrandColors,
  decodeProfileSocialLinks,
  decodeProfileCustomData,
} from "@repo/db"
import { hashPassword } from "@repo/auth"
import { saveProfileLogo, deleteProfileLogo } from "@repo/storage"
import multer from "multer"

const router: Router = Router()

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported image type: ${file.mimetype}`))
    }
  },
})

/**
 * Build a response-safe profile object from a DB profile row.
 */
function formatProfile(profile: Profile | null) {
  if (!profile) return null
  return {
    displayName: profile.displayName,
    title: profile.title,
    company: profile.company,
    brandColors: decodeProfileBrandColors(profile),
    logo: profile.logo,
    socialLinks: decodeProfileSocialLinks(profile),
    customData: decodeProfileCustomData(profile),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

/**
 * Format a user plus their identity profile for API responses.
 */
async function formatUserWithProfile(user: User) {
  const profile = await getProfileByUserId(user.id)
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profile: formatProfile(profile),
  }
}

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of all users in the system. Requires authentication.
 *     tags: [Users]
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
 *                       email:
 *                         type: string
 *                         example: "john@example.com"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-01-01T00:00:00Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-01-01T00:00:00Z"
 *                       profile:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           displayName: { type: string, nullable: true }
 *                           title: { type: string, nullable: true }
 *                           company: { type: string, nullable: true }
 *                           brandColors: { type: object }
 *                           logo: { type: string, nullable: true }
 *                           socialLinks: { type: object }
 *                           customData: { type: object }
 *                           createdAt: { type: string, format: date-time }
 *                           updatedAt: { type: string, format: date-time }
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
    const usersWithProfile = await Promise.all(
      allUsers.map((user) => formatUserWithProfile(user))
    )

    return res.json({
      success: true,
      users: usersWithProfile,
      count: usersWithProfile.length
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
 *                     email:
 *                       type: string
 *                       example: "john@example.com"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-01-01T00:00:00Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-01-01T00:00:00Z"
 *                     profile:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         displayName: { type: string, nullable: true }
 *                         title: { type: string, nullable: true }
 *                         company: { type: string, nullable: true }
 *                         brandColors: { type: object }
 *                         logo: { type: string, nullable: true }
 *                         socialLinks: { type: object }
 *                         customData: { type: object }
 *                         createdAt: { type: string, format: date-time }
 *                         updatedAt: { type: string, format: date-time }
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
      user: await formatUserWithProfile(user)
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
 *                     email:
 *                       type: string
 *                       example: "john@example.com"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-01-01T00:00:00Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-01-01T00:00:00Z"
 *                     profile:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         displayName: { type: string, nullable: true }
 *                         title: { type: string, nullable: true }
 *                         company: { type: string, nullable: true }
 *                         brandColors: { type: object }
 *                         logo: { type: string, nullable: true }
 *                         socialLinks: { type: object }
 *                         customData: { type: object }
 *                         createdAt: { type: string, format: date-time }
 *                         updatedAt: { type: string, format: date-time }
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

    // Check if username or email already exists
    const existingUser = await getUserByUsername(username)
    if (existingUser) {
      return res.status(400).json({
        error: "Username already exists"
      })
    }

    const existingEmail = await getUserByEmail(email)
    if (existingEmail) {
      return res.status(400).json({
        error: "Email already exists"
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
      user: await formatUserWithProfile(newUser),
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

/**
 * @openapi
 * /api/users/{userId}/profile:
 *   patch:
 *     summary: Update a user's identity profile
 *     description: Update brand/identity profile fields for a user.
 *     tags: [Users]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               title:
 *                 type: string
 *               company:
 *                 type: string
 *               brandColors:
 *                 type: object
 *               socialLinks:
 *                 type: object
 *               customData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                     id: { type: integer }
 *                     username: { type: string }
 *                     email: { type: string }
 *                     profile:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         displayName: { type: string, nullable: true }
 *                         title: { type: string, nullable: true }
 *                         company: { type: string, nullable: true }
 *                         brandColors: { type: object }
 *                         logo: { type: string, nullable: true }
 *                         socialLinks: { type: object }
 *                         customData: { type: object }
 *       400:
 *         description: Invalid user ID or request body
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to update profile
 */
router.patch("/:userId/profile", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" })
    }

    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        error: "Updating profiles requires authentication in production",
      })
    }

    const user = await getUserById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const { displayName, title, company, brandColors, socialLinks, customData } =
      req.body ?? {}

    const updates: Parameters<typeof updateProfile>[1] = {}
    if (displayName !== undefined) updates.displayName = displayName
    if (title !== undefined) updates.title = title
    if (company !== undefined) updates.company = company
    if (brandColors !== undefined) updates.brandColors = brandColors
    if (socialLinks !== undefined) updates.socialLinks = socialLinks
    if (customData !== undefined) updates.customData = customData

    const updated = await updateProfile(userId, updates)
    if (!updated) {
      return res.status(500).json({ error: "Failed to update profile" })
    }

    return res.json({
      success: true,
      user: await formatUserWithProfile(user),
    })
  } catch (error) {
    logger.error({
      message: "Failed to update profile",
      error: error,
    })
    return res.status(500).json({
      error: "Failed to update profile",
    })
  }
})

/**
 * @openapi
 * /api/users/{userId}/profile/logo:
 *   post:
 *     summary: Upload a profile logo
 *     description: Upload a logo image for the user's identity profile.
 *     tags: [Users]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Logo uploaded successfully
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
 *                     id: { type: integer }
 *                     username: { type: string }
 *                     email: { type: string }
 *                     profile:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         displayName: { type: string, nullable: true }
 *                         title: { type: string, nullable: true }
 *                         company: { type: string, nullable: true }
 *                         brandColors: { type: object }
 *                         logo: { type: string, nullable: true }
 *                         socialLinks: { type: object }
 *                         customData: { type: object }
 *       400:
 *         description: Invalid user ID or missing logo
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to upload logo
 */
router.post(
  "/:userId/profile/logo",
  upload.single("logo"),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.userId)

      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" })
      }

      if (process.env.NODE_ENV !== "development") {
        return res.status(403).json({
          error: "Uploading logos requires authentication in production",
        })
      }

      const user = await getUserById(userId)
      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      if (!req.file) {
        return res.status(400).json({ error: "Logo file is required" })
      }

      const profile = await getProfileByUserId(userId)
      const oldLogo = profile?.logo ?? null

      const logoPath = await saveProfileLogo(
        userId,
        req.file.buffer,
        req.file.originalname,
      )

      // Remove old logo file if present
      if (oldLogo) {
        try {
          await deleteProfileLogo(oldLogo)
        } catch (error) {
          logger.warn({
            message: "Failed to delete old profile logo",
            logo: oldLogo,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const updated = await updateProfile(userId, { logo: logoPath })
      if (!updated) {
        return res.status(500).json({ error: "Failed to update profile logo" })
      }

      return res.json({
        success: true,
        user: await formatUserWithProfile(user),
      })
    } catch (error) {
      logger.error({
        message: "Failed to upload profile logo",
        error: error,
      })
      return res.status(500).json({
        error: "Failed to upload profile logo",
      })
    }
  },
)

export default router