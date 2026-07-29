import type { Response } from "express";

/**
 * Extract the authenticated user id from Express response locals.
 * Returns undefined when no user is attached.
 */
export function requireUserId(res: Response): number | undefined {
  return (res.locals as { user?: { id?: number } }).user?.id;
}
