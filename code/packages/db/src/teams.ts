import { db } from "./client.ts";
import {
  teams,
  users,
  teamInvites,
  templates,
  sets,
  images,
  type NewTeam,
  type Team,
  type TeamInvite,
  type NewTeamInvite,
  type User,
} from "./schema.ts";
import { and, eq } from "drizzle-orm";

/** Team member roles. Admin has full access; editor can create/edit/delete
 * content; viewer is read-only. A user without a team has no role. */
export type TeamRole = "admin" | "editor" | "viewer";

export const TEAM_ROLES: TeamRole[] = ["admin", "editor", "viewer"];

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as string[]).includes(value);
}

function generateInviteCode(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : String(Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

/**
 * Create a team for a company and make the creator its first admin member.
 * One team per company. The creator's assets are NOT migrated; ownership of
 * existing assets stays with the creator (they become team-shared because they
 * are now a team member).
 * @see code/docs/team-design.md
 */
export async function createTeam(
  name: string,
  ownerUserId: number,
): Promise<Team | null> {
  const newTeam: NewTeam = {
    name,
    ownerUserId,
    inviteCode: generateInviteCode(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.insert(teams).values(newTeam).returning();
  const team = result[0] || null;
  if (!team) return null;

  await db
    .update(users)
    .set({ teamId: team.id, teamRole: "admin" })
    .where(eq(users.id, ownerUserId));
  return team;
}

// Get a team by id
export async function getTeamById(id: number): Promise<Team | null> {
  const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return result[0] || null;
}

// The team a user belongs to (via users.teamId)
export async function getTeamByUserId(userId: number): Promise<Team | null> {
  const user = await getUser(userId);
  if (!user || user.teamId === null) return null;
  return getTeamById(user.teamId);
}

// The team's brand-profile owner: the team owner's user id when the acting user
// belongs to a team, else null. Rendering always resolves the brand profile
// through this id so every teammate generates the same images.
export async function getTeamProfileUserId(userId: number): Promise<number | null> {
  const user = await getUser(userId);
  if (!user || user.teamId === null) return null;
  const team = await getTeamById(user.teamId);
  return team ? team.ownerUserId : null;
}

// Get a raw user row (no password hash exposure concerns here - internal)
async function getUser(userId: number): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] || null;
}

// Assign a user to a team with a given role (join)
export async function joinTeam(
  userId: number,
  teamId: number,
  role: TeamRole,
): Promise<void> {
  await db
    .update(users)
    .set({ teamId, teamRole: role })
    .where(eq(users.id, userId));
}

// Remove a user from their team (leave / removed by admin). Leaves assets where
// they are; callers decide whether to transfer ownership.
export async function leaveTeam(userId: number): Promise<void> {
  await db.update(users).set({ teamId: null, teamRole: null }).where(eq(users.id, userId));
}

// The acting role of a user in their team, or null when they have no team.
export async function getTeamRoleForUser(userId: number): Promise<TeamRole | null> {
  const user = await getUser(userId);
  return isTeamRole(user?.teamRole) ? (user!.teamRole as TeamRole) : null;
}

// All members of a team with their roles and contact info.
export async function getTeamMembers(
  teamId: number,
): Promise<Array<{ id: number; username: string; email: string; role: TeamRole | null }>> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.teamRole,
    })
    .from(users)
    .where(eq(users.teamId, teamId))
    .orderBy(users.createdAt);
  return rows.map((r) => ({ ...r, role: isTeamRole(r.role) ? (r.role as TeamRole) : "viewer" }));
}

// All user ids belonging to a team, INCLUDING the owner. Used to scope reads:
// a team member can read any asset owned by any teammate (shared workspace).
export async function getTeamMemberIds(teamId: number): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.teamId, teamId));
  return rows.map((r) => r.id);
}

// Get the team member ids for a given user: their own id plus (if they belong
// to a team) all their teammates' ids. Callers use this to scope templates,
// sets, images etc. so the whole team shares its workspace.
export async function getTeamMemberIdsForUser(userId: number): Promise<number[]> {
  const user = await getUser(userId);
  if (!user || user.teamId === null) return [userId];
  const ids = await getTeamMemberIds(user.teamId);
  return ids.length > 0 ? ids : [userId];
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Create an invite for a team. `email` optional: when set the invite can only
 * be accepted by a user whose email matches (email-scoped invite). */
export async function createTeamInvite(
  teamId: number,
  createdBy: number,
  token: string,
  role: TeamRole,
  email: string | null,
): Promise<TeamInvite | null> {
  const row: NewTeamInvite = {
    teamId,
    email,
    role,
    token,
    createdBy,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    createdAt: new Date(),
  };
  const result = await db.insert(teamInvites).values(row).returning();
  return result[0] || null;
}

export async function getTeamInviteByToken(token: string): Promise<TeamInvite | null> {
  const result = await db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.token, token))
    .limit(1);
  return result[0] || null;
}

export async function listTeamInvites(teamId: number): Promise<TeamInvite[]> {
  return db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.teamId, teamId))
    .orderBy(teamInvites.createdAt);
}

export async function markInviteAccepted(
  inviteId: number,
  acceptedBy: number,
): Promise<void> {
  await db
    .update(teamInvites)
    .set({ acceptedBy })
    .where(eq(teamInvites.id, inviteId));
}

export async function deleteTeamInvite(inviteId: number): Promise<void> {
  await db.delete(teamInvites).where(eq(teamInvites.id, inviteId));
}

/** Join a team by accepting an invite token. Validates expiry + email scope. */
export async function acceptInvite(
  userId: number,
  token: string,
  userEmail: string,
): Promise<{ ok: true; team: Team } | { ok: false; status: number; error: string }> {
  const invite = await getTeamInviteByToken(token);
  if (!invite) return { ok: false, status: 404, error: "Invite not found or no longer valid" };
  if (invite.acceptedBy !== null) {
    return { ok: false, status: 409, error: "This invite has already been used" };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 410, error: "This invite has expired" };
  }
  if (invite.email && invite.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
    return { ok: false, status: 403, error: "This invite is for a different email address" };
  }
  const team = await getTeamById(invite.teamId);
  if (!team) return { ok: false, status: 404, error: "Team not found" };

  const role = isTeamRole(invite.role) ? (invite.role as TeamRole) : "viewer";
  await joinTeam(userId, team.id, role);
  await markInviteAccepted(invite.id, userId);
  return { ok: true, team };
}

// ---------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------

/** Transfer a user's shared assets to another user (used when a member is
 * removed so their content stays with the team, @see team-design.md). */
export async function transferTeamAssetsToUser(
  fromUserId: number,
  toUserId: number,
): Promise<void> {
  await db.update(sets).set({ userId: toUserId }).where(eq(sets.userId, fromUserId));
  await db.update(templates).set({ userId: toUserId }).where(eq(templates.userId, fromUserId));
  await db.update(images).set({ userId: toUserId }).where(eq(images.userId, fromUserId));
}

// Detach a single member from a team (admin removal). Assets stay intact.
export async function removeTeamMember(teamId: number, userId: number): Promise<void> {
  await db
    .update(users)
    .set({ teamId: null, teamRole: null })
    .where(and(eq(users.id, userId), eq(users.teamId, teamId)));
}

/** Delete a team: detach every member, drop pending invites, remove the team.
 * Assets remain with their current owners (no ownership migration). */
export async function deleteTeam(teamId: number): Promise<void> {
  await db.update(users).set({ teamId: null, teamRole: null }).where(eq(users.teamId, teamId));
  await db.delete(teamInvites).where(eq(teamInvites.teamId, teamId));
  await db.delete(teams).where(eq(teams.id, teamId));
}

/** Rename a team (admin). */
export async function renameTeam(teamId: number, name: string): Promise<Team | null> {
  const result = await db
    .update(teams)
    .set({ name, updatedAt: new Date() })
    .where(eq(teams.id, teamId))
    .returning();
  return result[0] || null;
}