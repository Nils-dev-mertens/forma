import { beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import {
  initializeDatabase,
  createUser,
  createTeam,
  createTemplate,
  createSet,
  getTeamByUserId,
  getTeamRoleForUser,
  getSetsByUserIds,
} from "@repo/db";
import teamRoute from "../src/routes/api/team.ts";
import authRoute from "../src/routes/api/auth.ts";
import setRoute from "../src/routes/api/set.ts";
import { saveTemplate } from "@repo/storage";

function makeApp(userId: number, extras: Record<string, unknown> = {}): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    (res as any).locals.user = { id: userId, ...extras };
    next();
  });
  return app;
}

let adminId: number;
let editorId: number;
let viewerId: number;
let teamId: number;

beforeAll(async () => {
  process.env.FORMA_DB_PATH = ":memory:";
  process.env.AI_ENCRYPTION_KEY =
    process.env.AI_ENCRYPTION_KEY ?? "test-encryption-key-0123456789abcd";
  await initializeDatabase();

  const admin = await createUser("admin", "admin@acme.com", "hash");
  adminId = admin!.id;
  const team = await createTeam("Acme", adminId);
  teamId = team!.id;

  await createTemplate(adminId, "team-badge.html", "<div>{{ name }}</div>");
  await saveTemplate("team-badge.html", "<div>{{ name }}</div>");

  const editor = await createUser("editor", "editor@acme.com", "hash");
  editorId = editor!.id;
  const viewer = await createUser("viewer", "viewer@acme.com", "hash");
  viewerId = viewer!.id;
});

describe("team endpoints", () => {
  test("GET / returns the team with members and role", async () => {
    const app = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    app.use("/api/team", teamRoute);
    const res = await request(app).get("/api/team");
    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe("Acme");
    expect(res.body.role).toBe("admin");
    expect(res.body.members.map((m: any) => m.username)).toContain("admin");
    expect(res.body.teamMemberIds).toContain(adminId);
  });

  test("creating a second team is rejected (T10)", async () => {
    const app = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    app.use("/api/team", teamRoute);
    const res = await request(app).post("/api/team").send({ name: "Second" });
    expect(res.status).toBe(409);
  });

  test("owner cannot be removed", async () => {
    const app = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    app.use("/api/team", teamRoute);
    const res = await request(app).delete(`/api/team/members/${adminId}`);
    expect(res.status).toBe(400);
  });

  test("non-admin cannot create invites (403)", async () => {
    const app = makeApp(viewerId, { teamMemberIds: [adminId], teamRole: "viewer" });
    app.use("/api/team", teamRoute);
    const res = await request(app).post("/api/team/invite").send({ role: "editor" });
    expect(res.status).toBe(403);
  });

  test("email-scoped invite is rejected for a different email (403)", async () => {
    const adminApp = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    adminApp.use("/api/team", teamRoute);
    const inv = await request(adminApp)
      .post("/api/team/invite")
      .send({ email: "other@acme.com", role: "viewer" });
    expect(inv.status).toBe(201);

    const app = makeApp(viewerId);
    app.use("/api/team", teamRoute);
    const res = await request(app).post("/api/team/accept").send({ token: inv.body.invite.token });
    expect(res.status).toBe(403);
  });

  test("invite + accept joins the team at the invite's role", async () => {
    const adminApp = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    adminApp.use("/api/team", teamRoute);
    const inv = await request(adminApp)
      .post("/api/team/invite")
      .send({ email: "editor@acme.com", role: "editor" });
    expect(inv.status).toBe(201);
    expect(inv.body.invite.link).toContain("/dashboard/teams/join?token=");

    const app = makeApp(editorId);
    app.use("/api/team", teamRoute);
    const res = await request(app).post("/api/team/accept").send({ token: inv.body.invite.token });
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(teamId);
    expect(await getTeamRoleForUser(editorId)).toBe("editor");

    // Re-accepting the same invite is refused
    const again = await request(app).post("/api/team/accept").send({ token: inv.body.invite.token });
    expect([409, 403]).toContain(again.status);
  });

  test("viewer joins via a viewer-role invite", async () => {
    const adminApp = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    adminApp.use("/api/team", teamRoute);
    const inv = await request(adminApp)
      .post("/api/team/invite")
      .send({ email: "viewer@acme.com", role: "viewer" });
    const app = makeApp(viewerId);
    app.use("/api/team", teamRoute);
    const res = await request(app).post("/api/team/accept").send({ token: inv.body.invite.token });
    expect(res.status).toBe(200);
    expect(await getTeamRoleForUser(viewerId)).toBe("viewer");
  });
});

describe("content role enforcement (T9)", () => {
  const teamScope = () => ({ teamMemberIds: [adminId, editorId, viewerId] });

  test("viewer is blocked from creating a set (403)", async () => {
    const app = makeApp(viewerId, { ...teamScope(), teamRole: "viewer" });
    app.use("/api/set", setRoute);
    const res = await request(app)
      .post("/api/set")
      .send({ name: "viewer-set", fields: [], templates: ["team-badge.html"] });
    expect(res.status).toBe(403);
  });

  test("editor can create a set", async () => {
    const app = makeApp(editorId, { ...teamScope(), teamRole: "editor" });
    app.use("/api/set", setRoute);
    const res = await request(app)
      .post("/api/set")
      .send({
        name: "editor-set",
        fields: [{ fieldname: "name", type: "string" }],
        templates: ["team-badge.html"],
      });
    expect(res.status).toBe(201);
  });

  test("viewer can read a teammate's set (shared workspace)", async () => {
    const app = makeApp(viewerId, { ...teamScope(), teamRole: "viewer" });
    app.use("/api/set", setRoute);
    const res = await request(app).get("/api/set");
    expect(res.status).toBe(200);
    const names = res.body.sets.map((s: any) => s.name);
    expect(names).toContain("editor-set");
  });

  test("admin removes a member and their assets transfer to the owner (T7)", async () => {
    const editorSets = await getSetsByUserIds([editorId]);
    expect(editorSets.map((s) => s.name)).toContain("editor-set");

    const app = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    app.use("/api/team", teamRoute);
    const res = await request(app).delete(`/api/team/members/${editorId}`);
    expect(res.status).toBe(200);

    expect(await getTeamRoleForUser(editorId)).toBeNull();
    const editorSetsAfter = await getSetsByUserIds([editorId]);
    expect(editorSetsAfter.map((s) => s.name)).not.toContain("editor-set");
    const ownerSets = await getSetsByUserIds([adminId]);
    expect(ownerSets.map((s) => s.name)).toContain("editor-set");
  });
});

describe("register team onboarding (T1/T5)", () => {
  test("register auto-creates a team the user administers", async () => {
    const app = makeApp(1);
    app.use("/api/auth", authRoute);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "solo", email: "solo@example.com", password: "secret1" });
    expect(res.status).toBe(201);
    expect(res.body.team.name).toBe("solo Team");
    const team = await getTeamByUserId(res.body.user.id);
    expect(team).not.toBeNull();
    expect(await getTeamRoleForUser(res.body.user.id)).toBe("admin");
  });

  test("register with an inviteToken joins the invited team instead of creating one", async () => {
    const adminApp = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    adminApp.use("/api/team", teamRoute);
    const inv = await request(adminApp)
      .post("/api/team/invite")
      .send({ email: "newcomer@acme.com", role: "editor" });
    expect(inv.status).toBe(201);

    const app = makeApp(1);
    app.use("/api/auth", authRoute);
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "newcomer",
        email: "newcomer@acme.com",
        password: "secret1",
        inviteToken: inv.body.invite.token,
      });
    expect(res.status).toBe(201);
    expect(res.body.team.id).toBe(teamId);
    expect(await getTeamRoleForUser(res.body.user.id)).toBe("editor");
  });

  test("register with a bad inviteToken is rejected", async () => {
    const app = makeApp(1);
    app.use("/api/auth", authRoute);
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "rejected",
        email: "rejected@example.com",
        password: "secret1",
        inviteToken: "no-such-token",
      });
    expect(res.status).toBe(404);
  });
});

describe("team deletion", () => {
  test("admin deletes the team and is detached", async () => {
    const app = makeApp(adminId, { teamMemberIds: [adminId], teamRole: "admin" });
    app.use("/api/team", teamRoute);
    const res = await request(app).delete("/api/team");
    expect(res.status).toBe(200);
    expect(await getTeamByUserId(adminId)).toBeNull();
    expect(await getTeamRoleForUser(adminId)).toBeNull();
  });
});