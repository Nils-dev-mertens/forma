# Teams — design

**Ticket:** #14 — Team support: define teams, permissions, and asset sharing
**Status:** Implemented (2026-09-14)
**Branch:** `14-team-support-define-teams`

## Decision (per the issue comments of 2026-09-04, superseding the no-roles design)

- **One team per user (T10).** Registering always auto-creates a team for the user
  (T1), unless they sign up through an invite link (T5), in which case they join the
  inviting team instead.
- **Roles: `admin` / `editor` / `viewer`.** No finer tiers.

| Action                                        | Admin | Editor | Viewer |
|-----------------------------------------------|:-----:|:------:|:------:|
| Create/edit/delete sets and templates         | ✔     | ✔      | —      |
| Generate images                               | ✔     | ✔      | —      |
| Add/edit/delete records (entries)             | ✔     | ✔      | —      |
| Read sets, templates, entries, generated images | ✔   | ✔      | ✔      |
| Invite members (email or link) and revoke invites | ✔ | —     | —      |
| Remove members (assets stay with the team, T7)| ✔     | —      | —      |
| Rename / delete the team                      | ✔     | —      | —      |

Users **without** a team (solo, dev default, API keys) have no role and are treated as
full access (fail-open) so existing single-user flows/tests are unaffected.

### User stories

- **T1** Team creation on signup: `POST /api/auth/register` auto-creates `<username> Team`
  and makes the user its admin.
- **T2** Onboarding: after registration the brand-profile onboarding flow is unchanged;
  the team already exists, admin can rename it on the Team page.
- **T3** Invite via email: `POST /api/team/invite { email, role }` — invite is scoped to
  that address (T5 enforce). Email dispatch itself is deferred (share the link manually).
- **T4** Invite via link: invite without email is shareable; link is
  `${origin}/dashboard/teams/join?token=…`.
- **T5** Join via invite link: logged-in users accept via `POST /api/team/accept`;
  anonymous users register with `inviteToken` to join.
- **T6** Remove member (admin only). Members cannot leave voluntarily (no `/leave`
  endpoint).
- **T7** Content stays with the team: on member removal, their sets/templates/images are
  transferred to `teams.ownerUserId`. (`profiles` stay with their user — deviation.)
- **T8** Team settings on the dashboard at `/dashboard/teams` (nav "Team"): members,
  invites, rename, danger zone. Unlimited members.
- **T9** Role enforcement on the API (see scope model + gates below).
- **T10** One team per user: `users.team_id` is single-valued; a second team create is 409.

## Data model

`teams` table:

| column          | type      | notes |
|-----------------|-----------|-------|
| `id`            | integer PK autoincrement | |
| `name`          | text NOT NULL | |
| `owner_user_id` | integer NOT NULL FK→users | creator (first member) |
| `invite_code`   | text NOT NULL UNIQUE | generated on create |
| `created_at`    | timestamp | |
| `updated_at`    | timestamp | |

`users.team_id` integer FK→teams(id) nullable (null = solo / no team) and
`users.team_role` text nullable (`admin`/`editor`/`viewer`).

`team_invites` table:

| column      | type      | notes |
|-------------|-----------|-------|
| `id`        | integer PK autoincrement | |
| `team_id`   | integer NOT NULL FK→teams | |
| `email`     | text nullable | null = shareable link; set = email-scoped |
| `role`      | text NOT NULL | role granted on accept |
| `token`     | text NOT NULL UNIQUE | the shared secret in the join URL |
| `created_by`| integer NOT NULL FK→users | admin who created it |
| `accepted_by`| integer nullable FK→users | set when used (single-use) |
| `expires_at`| timestamp NOT NULL | 7-day TTL |
| `created_at`| timestamp | |

Relations: `teams.ownerUser`, `teams.members` (many users), `users.team`,
`teams.invites` (many `team_invites`).

## Scope model (T9)

The ownership seam is `userId`. With teams, every "owned by user" check widens to
"owned by any of the user's **team member ids**". The AuthHandler resolves the acting
user's `teamMemberIds` + `teamRole` once per request (both session and API-key branches)
and stores them on `res.locals.user`. Routes read that list instead of the bare `userId`;
role gates (`canEditContent`, `hasAnyTeamRole`) read `teamRole`.

Helpers in `apps/api/src/utils/auth.ts`:
- `getScopedUserIds(res)` → `teamMemberIds` (fallback `[userId]`)
- `canEditContent(res)` → admin/editor (or no-team), gates content writes
- `hasAnyTeamRole(res, roles)` → admin always allowed; used for invite/remove/rename/delete
- `isAdminOfTeam(res)` = `hasAnyTeamRole(res, [])`

Data-access widening (in `@repo/db`), keeping the single-user accessors:
- `getTemplatesByUserIds`, `getTemplateByNameForUserIds`, `getTemplateNamesByUserIds`
- `getSetsByUserIds`, `getSetByNameForUserIds`
- `getImageByNameForUserIds`, `getImagesByEntryIdAndTemplateNames({userIds,…})`,
  `getOrphanImagesBySetId({userIds,…})`, `getImagesByEntryId({userIds,…})`

Template and set names stay globally unique across the whole scope (a company shares one
set of template names); the unique constraints remain unscoped per team.

## API surface

New `apps/api/src/routes/api/team.ts` mounted at `/api/team`.

- `GET /api/team` → `{ team, members, invites, role, teamMemberIds }` (401 if no team)
- `POST /api/team { name }` → 201 (creator becomes admin; 409 if already in a team)
- `PATCH /api/team { name }` → rename (admin)
- `DELETE /api/team` → 200 (admin; detaches every member, drops invites)
- `POST /api/team/invite { email?, role }` → 201 `{ invite, link }` (admin)
- `GET /api/team/invites` → pending invites with links (admin)
- `POST /api/team/invites/:inviteId/revoke` → revoke (admin)
- `POST /api/team/accept { token }` → 200 `{ team }` (must not be in a team yet)
- `DELETE /api/team/members/:userId` → 200 (admin; transfers assets to owner; owner and
  self are guarded)

Also changed:
- `POST /api/auth/register` accepts optional `inviteToken` (T1/T5) and returns the team.
- `set.ts`, `template.ts`, `photos.ts`, `generation/image.ts`, `ai.ts` (save-template),
  and `setTriggers.ts` use `getScopedUserIds` + `canEditContent` gates.

## Dashboard

- Team page at `/dashboard/teams` (nav "Team"): members+roles, invite creation + copy
  link, pending invites with revoke, rename, delete team (admin). Viewers/editors get a
  read-only member list.
- Join page `/dashboard/teams/join?token=…`: logged-in users accept; anonymous users are
  sent to login or register (register forwards `inviteToken`).

## Out of scope (deferred)

- Email dispatch for invites (invites are shared via links/copy-paste).
- Per-team email domains / SSO.
- Team *leave* (members cannot leave voluntarily; admin removal only).