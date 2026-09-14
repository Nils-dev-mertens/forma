import { apiFetch } from "./core";

export type TeamRole = "admin" | "editor" | "viewer";

export interface Team {
  id: number;
  ownerUserId: number;
  name: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: number;
  username: string;
  email: string;
  role: TeamRole | null;
}

export interface TeamInvite {
  id: number;
  teamId: number;
  email: string | null;
  role: TeamRole | string;
  token: string;
  createdBy: number;
  acceptedBy: number | null;
  expiresAt: string;
  createdAt: string;
  link?: string;
}

export interface TeamResponse {
  success: true;
  team: Team;
  members: TeamMember[];
  invites: TeamInvite[];
  role: TeamRole | null;
  teamMemberIds: number[];
}

export async function getTeam(): Promise<TeamResponse> {
  return apiFetch<TeamResponse>("/api/team");
}

export interface TeamProfileResponse {
  success: true;
  teamId: number;
  profile: import("./profile").Profile | null;
}

// The team's shared brand profile (the owner's profile). Every member's
// templates render with this, so previews must use it to match the output.
export async function getTeamProfile(): Promise<TeamProfileResponse> {
  return apiFetch<TeamProfileResponse>("/api/team/profile");
}

export async function createTeam(name: string): Promise<{ success: true; team: Team }> {
  return apiFetch<{ success: true; team: Team }>("/api/team", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function renameTeam(name: string): Promise<{ success: true; team: Team }> {
  return apiFetch<{ success: true; team: Team }>("/api/team", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteTeam(): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/api/team", {
    method: "DELETE",
  });
}

export async function createInvite(
  role: TeamRole,
  email?: string
): Promise<{ success: true; invite: TeamInvite; note?: string }> {
  return apiFetch<{ success: true; invite: TeamInvite; note?: string }>("/api/team/invite", {
    method: "POST",
    body: JSON.stringify({ role, email: email?.trim() || undefined }),
  });
}

export async function revokeInvite(inviteId: number): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/team/invites/${inviteId}/revoke`, {
    method: "POST",
  });
}

export async function acceptInvite(token: string): Promise<{ success: true; team: Team }> {
  return apiFetch<{ success: true; team: Team }>("/api/team/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function removeMember(userId: number): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/team/members/${userId}`, {
    method: "DELETE",
  });
}