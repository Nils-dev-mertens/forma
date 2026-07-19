import { db } from "./client.ts"
import { User, users } from "./schema.ts"
import { eq } from "drizzle-orm"

/**
 * Get all users from the database
 * @returns Promise<User[]> - Array of all users
 */
export async function getAllUsers(): Promise<User[]> {
  return await db.select().from(users)
}

/**
 * Get a specific user by ID
 * @param userId - The ID of the user to retrieve
 * @returns Promise<User | null> - The user if found, null otherwise
 */
export async function getUserById(userId: number): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return result[0] || null
}

/**
 * Get a user by username
 * @param username - The username to search for
 * @returns Promise<User | null> - The user if found, null otherwise
 */
export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1)
  return result[0] || null
}

/**
 * Create a new user
 * @param username - The username for the new user
 * @param email - The email for the new user
 * @param passwordHash - The password hash for the new user
 * @returns Promise<User | null> - The created user if successful, null otherwise
 */
export async function createUser(username: string, email: string, passwordHash: string): Promise<User | null> {
  // Check if username already exists
  const existingUser = await getUserByUsername(username)
  if (existingUser) {
    return null // Username already exists
  }

  // Check if email already exists
  const existingEmail = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existingEmail && existingEmail.length > 0) {
    return null // Email already exists
  }

  const result = await db.insert(users).values({
    username: username,
    email: email,
    passwordHash: passwordHash,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning()

  return result[0] || null
}

/**
 * Update a user's information
 * @param userId - The ID of the user to update
 * @param updates - Object containing fields to update
 * @returns Promise<User | null> - The updated user if successful, null otherwise
 */
export async function updateUser(userId: number, updates: Partial<Omit<User, "id" | "createdAt">>): Promise<User | null> {
  const result = await db.update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  return result[0] || null
}

/**
 * Delete a user
 * @param userId - The ID of the user to delete
 * @returns Promise<boolean> - True if deletion was successful, false otherwise
 */
export async function deleteUser(userId: number): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, userId)).run()
  
  // @ts-ignore - changes property exists on the result
  return (result as any).changes > 0
}