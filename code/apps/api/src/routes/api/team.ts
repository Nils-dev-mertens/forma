import { Router, type RequestHandler } from "express";
import {
  createTeam,
  getTeamByUserId,
  getTeamMembers,
  getTeamMemberIds,
  getTeamRoleForUser,
  createTeamInvite,
  listTeamInvites,
  deleteTeamInvite,
  acceptInvite,
  removeTeamMember,
  deleteTeam,
  renameTeam,
  transferTeamAssetsToUser,
  getUserById,
  getProfileByUserId,
  isTeamRole,
  type TeamRole,
} from "@repo/db";
import { logger } from "@repo/logger";
import { dashboardOrigin } from "../../config.ts";
import { hasAnyTeamRole } from "../../utils/auth.ts";

interface LocalUser {
  id: number;
  teamMemberIds?: number[];
  teamRole?: string | null;
}

const router: Router = Router();
const MAX_TEAM_NAME = 80;

function generateToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  }
  return String(Date.now().toString(36) + Math.random().toString(36).slice(2, 8)) + String(Math.random().toString(36).slice(2, 10));
}

function requireUser(res: any): LocalUser | null {
  const user = res.locals?.user as LocalUser | undefined;
  if (!user || typeof user.id !== "number") return null;
  return user;
}

/**
 * @openapi
 * /api/team:
 *   get:
 *     summary: Get the current user's team
 *     description: Returns the user's team, its members (with roles), pending invites and the caller's own role. 401 when the user has no team.
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     responses:
 *       200: { description: Team details }
 *       401: { description: No team }
 */
router.get("/", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const team = await getTeamByUserId(user.id);
    if (!team) return res.status(404).json({ error: "You are not part of a team" });
    const [members, invites, role] = await Promise.all([
      getTeamMembers(team.id),
      listTeamInvites(team.id),
      getTeamRoleForUser(user.id),
    ]);
    return res.json({ success: true, team, members, invites, role, teamMemberIds: user.teamMemberIds ?? [user.id] });
  } catch (error) {
    logger.error({ message: "Failed to fetch team", error, userId: user.id });
    return res.status(500).json({ error: "Failed to fetch team" });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team/profile:
 *   get:
 *     summary: Get the team's shared brand profile
 *     description: Returns the team's brand profile (the owner's profile), which is what every member's templates render with.
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     responses:
 *       200: { description: Team brand profile }
 *       404: { description: Not part of a team }
 */
router.get("/profile", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const team = await getTeamByUserId(user.id);
    if (!team) return res.status(404).json({ error: "You are not part of a team" });
    const profile = await getProfileByUserId(team.ownerUserId);
    return res.json({ success: true, teamId: team.id, profile });
  } catch (error) {
    logger.error({ message: "Failed to fetch team profile", error, userId: user.id });
    return res.status(500).json({ error: "Failed to fetch team profile" });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team:
 *   post:
 *     summary: Create a team
 *     description: Creates a team for the current user and makes them its admin. Only allowed for users without a team yet.
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Acme Inc." }
 *     responses:
 *       201: { description: Team created }
 *       400: { description: Invalid name }
 *       409: { description: Already in a team }
 */
router.post("/", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > MAX_TEAM_NAME) {
    return res.status(400).json({ error: "Team name is required (max 80 characters)." });
  }
  try {
    const existing = await getTeamByUserId(user.id);
    if (existing) return res.status(409).json({ error: "You are already in a team." });
    const team = await createTeam(name, user.id);
    if (!team) return res.status(500).json({ error: "Failed to create team." });
    logger.info({ message: "Team created", teamId: team.id, userId: user.id });
    res.locals.user = { ...user, teamMemberIds: [user.id], teamRole: "admin" };
    return res.status(201).json({ success: true, team });
  } catch (error) {
    logger.error({ message: "Failed to create team", error, userId: user.id });
    return res.status(500).json({ error: "Failed to create team." });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team:
 *   patch:
 *     summary: Rename the team (admin only)
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200: { description: Team renamed }
 *       403: { description: Not an admin }
 *       404: { description: No team }
 */
router.patch("/", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!hasAnyTeamRole(res, [])) return res.status(403).json({ error: "Only admins can manage the team." });
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > MAX_TEAM_NAME) {
    return res.status(400).json({ error: "Team name is required (max 80 characters)." });
  }
  try {
    const team = await getTeamByUserId(user.id);
    if (!team) return res.status(404).json({ error: "You are not part of a team" });
    const updated = await renameTeam(team.id, name);
    return res.json({ success: true, team: updated });
  } catch (error) {
    logger.error({ message: "Failed to rename team", error, userId: user.id });
    return res.status(500).json({ error: "Failed to rename team." });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team:
 *   delete:
 *     summary: Delete the team (admin only)
 *     description: Detaches every member (content stays with its owners) and drops pending invites.
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     responses:
 *       200: { description: Team deleted }
 *       403: { description: Not an admin }
 */
router.delete("/", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!hasAnyTeamRole(res, [])) return res.status(403).json({ error: "Only admins can delete the team." });
  try {
    const team = await getTeamByUserId(user.id);
    if (!team) return res.status(404).json({ error: "You are not part of a team" });
    await deleteTeam(team.id);
    res.locals.user = { ...user, teamMemberIds: [user.id], teamRole: null };
    logger.info({ message: "Team deleted", teamId: team.id, userId: user.id });
    return res.json({ success: true });
  } catch (error) {
    logger.error({ message: "Failed to delete team", error, userId: user.id });
    return res.status(500).json({ error: "Failed to delete team." });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team/invite:
 *   post:
 *     summary: Create an invite (admin only)
 *     description: |
 *       Creates an invite link. When `email` is set the invite can only be used by
 *       that address (only the email address is needed; email dispatch itself is
 *       handled elsewhere/out of scope). Without an email the link is shareable.
 *       Returns the invite with its ready-to-share link.
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, example: "ada@acme.com" }
 *               role: { type: string, enum: [admin, editor, viewer], example: "editor" }
 *     responses:
 *       201: { description: Invite created }
 *       400: { description: Invalid role }
 *       403: { description: Not an admin }
 */
router.post("/invite", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!hasAnyTeamRole(res, [])) return res.status(403).json({ error: "Only admins can invite members." });
  const team = await getTeamByUserId(user.id);
  if (!team) return res.status(404).json({ error: "You are not part of a team" });

  const email = typeof req.body?.email === "string" && req.body.email.trim() !== ""
    ? req.body.email.trim()
    : null;
  const roleRaw = typeof req.body?.role === "string" ? req.body.role : "viewer";
  const role = isTeamRole(roleRaw) ? (roleRaw as TeamRole) : "viewer";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  try {
    const token = generateToken();
    const invite = await createTeamInvite(team.id, user.id, token, role, email);
    if (!invite) return res.status(500).json({ error: "Failed to create invite." });
    const link = `${dashboardOrigin}/dashboard/teams/join?token=${token}`;
    logger.info({ message: "Invite created", teamId: team.id, userId: user.id, email: email ?? undefined });
    return res.status(201).json({
      success: true,
      invite: { ...invite, link },
      note: email ? "Email dispatch is not wired up; share the link manually." : undefined,
    });
  } catch (error) {
    logger.error({ message: "Failed to create invite", error, userId: user.id });
    return res.status(500).json({ error: "Failed to create invite." });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team/invites:
 *   get:
 *     summary: List pending invites (admin only)
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     responses:
 *       200: { description: Invites listed }
 *       403: { description: Not an admin }
 */
router.get("/invites", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!hasAnyTeamRole(res, [])) return res.status(403).json({ error: "Only admins can manage invites." });
  try {
    const team = await getTeamByUserId(user.id);
    if (!team) return res.status(404).json({ error: "You are not part of a team" });
    const invites = await listTeamInvites(team.id);
    return res.json({ success: true, invites: invites.map((inv) => ({
      ...inv,
      link: `${dashboardOrigin}/dashboard/teams/join?token=${inv.token}`,
    })) });
  } catch (error) {
    logger.error({ message: "Failed to list invites", error, userId: user.id });
    return res.status(500).json({ error: "Failed to list invites." });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team/invites/{inviteId}/revoke:
 *   post:
 *     summary: Revoke an invite (admin only)
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     responses:
 *       200: { description: Invite revoked }
 *       403: { description: Not an admin }
 */
router.post("/invites/:inviteId/revoke", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!hasAnyTeamRole(res, [])) return res.status(403).json({ error: "Only admins can manage invites." });
  const inviteId = Number(req.params.inviteId);
  if (!Number.isInteger(inviteId)) return res.status(400).json({ error: "Invalid invite id" });
  try {
    const team = await getTeamByUserId(user.id);
    if (!team) return res.status(404).json({ error: "You are not part of a team" });
    await deleteTeamInvite(inviteId);
    return res.json({ success: true });
  } catch (error) {
    logger.error({ message: "Failed to revoke invite", error, userId: user.id });
    return res.status(500).json({ error: "Failed to revoke invite." });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team/accept:
 *   post:
 *     summary: Accept an invite and join a team
 *     description: |
 *       Joins the team behind the invite token, granting the invite's role.
 *       Requires the caller to not be in a team yet. Email-scoped invites only
 *       work for the matching email address.
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: Joined the team }
 *       403: { description: Email mismatch or already used }
 *       409: { description: Already in a team }
 *       410: { description: Invite expired }
 */
router.post("/accept", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) return res.status(400).json({ error: "token is required." });

  try {
    const existing = await getTeamByUserId(user.id);
    if (existing) {
      return res.status(409).json({ error: "You are already part of a team. Leave or delete it before joining another." });
    }
    const userRecord = await getUserById(user.id);
    const acceptResult = await acceptInvite(user.id, token, userRecord?.email ?? "");
    if (!acceptResult.ok) return res.status(acceptResult.status).json({ error: acceptResult.error });
    logger.info({ message: "User accepted invite", teamId: acceptResult.team.id, userId: user.id });
    const [memberIds, role] = await Promise.all([
      getTeamMemberIds(acceptResult.team.id),
      getTeamRoleForUser(user.id),
    ]);
    res.locals.user = { ...user, teamMemberIds: memberIds, teamRole: role };
    return res.json({ success: true, team: acceptResult.team });
  } catch (error) {
    logger.error({ message: "Failed to accept invite", error, userId: user.id });
    return res.status(500).json({ error: "Failed to join the team." });
  }
}) as RequestHandler);

/**
 * @openapi
 * /api/team/members/{userId}:
 *   delete:
 *     summary: Remove a member (admin only)
 *     description: |
 *       Removes a member from the team. Their assets (sets, templates, generated
 *       images) are transferred to the team owner so the content stays with the
 *       team. The owner cannot be removed; deleting the team is the way out.
 *     tags: [Teams]
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Member removed }
 *       400: { description: Cannot remove the owner or yourself }
 *       403: { description: Not an admin }
 *       404: { description: Not a member }
 */
router.delete("/members/:userId", (async (req, res) => {
  const user = requireUser(res);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!hasAnyTeamRole(res, [])) return res.status(403).json({ error: "Only admins can remove members." });
  const targetId = Number(req.params.userId);
  if (!Number.isInteger(targetId)) return res.status(400).json({ error: "Invalid user id" });
  if (targetId === user.id) return res.status(400).json({ error: "You cannot remove yourself from the team. Delete the team instead." });

  try {
    const team = await getTeamByUserId(user.id);
    if (!team) return res.status(404).json({ error: "You are not part of a team" });
    if (team.ownerUserId === targetId) {
      return res.status(400).json({ error: "The team owner cannot be removed. Delete the team instead." });
    }
    const memberIds = await getTeamMemberIds(team.id);
    if (!memberIds.includes(targetId)) {
      return res.status(404).json({ error: "That user is not a member of this team." });
    }
    await transferTeamAssetsToUser(targetId, team.ownerUserId);
    await removeTeamMember(team.id, targetId);
    logger.info({ message: "Member removed, assets transferred to owner", teamId: team.id, targetUserId: targetId, ownerUserId: team.ownerUserId });
    return res.json({ success: true });
  } catch (error) {
    logger.error({ message: "Failed to remove member", error, userId: user.id });
    return res.status(500).json({ error: "Failed to remove member." });
  }
}) as RequestHandler);

export default router;