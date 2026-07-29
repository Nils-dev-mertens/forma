import { Router } from "express"
import { logger } from "@repo/logger"
import {
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  markOnboardingComplete,
  updateProfile,
  type User,
} from "@repo/db"
import { hashPassword, verifyPassword } from "@repo/auth"

const router: Router = Router()

export interface AuthUser {
  id: number
  username: string
  email: string
  onboardingCompleted: boolean
  createdAt: Date
  updatedAt: Date
}

function formatAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account and start a session.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       201:
 *         description: User registered and logged in
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || typeof username !== "string" || username.trim() === "") {
      return res.status(400).json({ error: "Username is required" })
    }

    if (!email || typeof email !== "string" || email.trim() === "") {
      return res.status(400).json({ error: "Email is required" })
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" })
    }

    const existingUsername = await getUserByUsername(username.trim())
    if (existingUsername) {
      return res.status(400).json({ error: "Username already exists" })
    }

    const existingEmail = await getUserByEmail(email.trim())
    if (existingEmail) {
      return res.status(400).json({ error: "Email already exists" })
    }

    const passwordHash = await hashPassword(password)
    const newUser = await createUser(username.trim(), email.trim(), passwordHash)

    if (!newUser) {
      return res.status(500).json({ error: "Failed to create user" })
    }

    ;(req as any).session = { ...(req as any).session, userId: newUser.id }

    logger.info({
      message: "User registered",
      userId: newUser.id,
      username: newUser.username,
    })

    return res.status(201).json({
      success: true,
      user: formatAuthUser(newUser),
    })
  } catch (error) {
    logger.error({ message: "Failed to register user", error })
    return res.status(500).json({ error: "Failed to register user" })
  }
})

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in a user
 *     description: Verify credentials and start a session.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Logged in
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || typeof username !== "string" || username.trim() === "") {
      return res.status(400).json({ error: "Username is required" })
    }

    if (!password || typeof password !== "string" || password.trim() === "") {
      return res.status(400).json({ error: "Password is required" })
    }

    const user = await getUserByUsername(username.trim())

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const isValid = await verifyPassword(password, user.passwordHash)

    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    ;(req as any).session = { ...(req as any).session, userId: user.id }

    logger.info({
      message: "User logged in",
      userId: user.id,
      username: user.username,
    })

    return res.json({
      success: true,
      user: formatAuthUser(user),
    })
  } catch (error) {
    logger.error({ message: "Failed to log in user", error })
    return res.status(500).json({ error: "Failed to log in" })
  }
})

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Log out the current user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post("/logout", (req, res) => {
  ;(req as any).session = null
  return res.json({ success: true })
})

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current user
 *       401:
 *         description: Not authenticated
 */
router.get("/me", async (req, res) => {
  try {
    const userId = (req as any).session?.userId

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" })
    }

    const user = await getUserById(userId)

    if (!user) {
      ;(req as any).session = null
      return res.status(401).json({ error: "Not authenticated" })
    }

    return res.json({
      success: true,
      user: formatAuthUser(user),
    })
  } catch (error) {
    logger.error({ message: "Failed to get current user", error })
    return res.status(500).json({ error: "Failed to get current user" })
  }
})

/**
 * @openapi
 * /api/auth/onboarding:
 *   post:
 *     summary: Complete onboarding
 *     description: Update profile and mark onboarding as completed.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName: { type: string }
 *               company: { type: string }
 *               title: { type: string }
 *     responses:
 *       200:
 *         description: Onboarding completed
 *       401:
 *         description: Not authenticated
 */
router.post("/onboarding", async (req, res) => {
  try {
    const userId = (req as any).session?.userId

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" })
    }

    const user = await getUserById(userId)
    if (!user) {
      ;(req as any).session = null
      return res.status(401).json({ error: "Not authenticated" })
    }

    const { displayName, company, title } = req.body ?? {}

    await updateProfile(userId, {
      displayName: typeof displayName === "string" ? displayName.trim() : undefined,
      company: typeof company === "string" ? company.trim() : undefined,
      title: typeof title === "string" ? title.trim() : undefined,
    })

    await markOnboardingComplete(userId)

    return res.json({ success: true })
  } catch (error) {
    logger.error({ message: "Failed to complete onboarding", error })
    return res.status(500).json({ error: "Failed to complete onboarding" })
  }
})

export default router
