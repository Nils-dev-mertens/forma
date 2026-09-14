import type { Response } from "express";

interface LocalUser {
  id?: number;
  teamMemberIds?: number[];
  teamRole?: string | null;
}

/**
 * Extract the authenticated user id from Express response locals.
 * Returns undefined when no user is attached.
 */
export function requireUserId(res: Response): number | undefined {
  return (res.locals as { user?: { id?: number } }).user?.id;
}

/**
 * The user ids the acting user is allowed to touch: their own id, widened to
 * their whole team (teamMemberIds) when they belong to one. Falls back to the
 * bare user id for solo users / dev defaults.
 */
export function getScopedUserIds(res: Response): number[] {
  const user = (res.locals as { user?: LocalUser }).user;
  if (!user || typeof user.id !== "number") return [];
  if (Array.isArray(user.teamMemberIds) && user.teamMemberIds.length > 0) {
    return user.teamMemberIds;
  }
  return [user.id];
}

/**
 * Role check against res.locals.user.teamRole. Users WITHOUT a team (solo,
 * dev default, api keys) have no role and are granted access; team members are
 * allowed only when their role is in `roles` (admin always allowed).
 */
export function hasAnyTeamRole(res: Response, roles: string[]): boolean {
  const role = (res.locals as { user?: LocalUser }).user?.teamRole;
  if (!role) return true;
  return role === "admin" || roles.includes(role);
}

/** Content writes (create/edit/delete sets, templates, entries, uploads). */
export function canEditContent(res: Response): boolean {
  return hasAnyTeamRole(res, ["editor"]);
}

/** Member/team management (invites, removal, deletes, rename). */
export function isAdminOfTeam(res: Response): boolean {
  return hasAnyTeamRole(res, []);
}