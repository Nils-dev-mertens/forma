import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  getTeam,
  renameTeam,
  createInvite,
  revokeInvite,
  removeMember,
  deleteTeam,
} from "@/lib/api/team";
import type { TeamRole } from "@/lib/api/team";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/teams/")({ component: TeamsPage });

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function roleBadgeClass(role: string | null): string {
  switch (role) {
    case "admin":
      return "bg-primary/10 text-primary";
    case "editor":
      return "bg-accent text-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function copyText(text: string): void {
  const clipboard = (navigator as unknown as { clipboard?: Clipboard }).clipboard;
  if (clipboard?.writeText) {
    clipboard.writeText(text).catch(() => {});
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // ignore
  } finally {
    document.body.removeChild(textarea);
  }
}

function TeamsPage() {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: getTeam,
    retry: false,
  });

  const [renameValue, setRenameValue] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["team"] });
  }

  const renameMutation = useMutation({
    mutationFn: () => renameTeam(renameValue.trim()),
    onSuccess: () => {
      setSuccess("Team renamed.");
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to rename team");
      setSuccess(null);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => createInvite(inviteRole, inviteEmail || undefined),
    onSuccess: (result) => {
      const link = result.invite.link ?? "";
      copyText(link);
      setCopied(true);
      setInviteEmail("");
      setSuccess(
        result.note ? "Invite created. " + result.note : "Invite created. Copy the link and share it."
      );
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create invite");
      setSuccess(null);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: number) => revokeInvite(inviteId),
    onSuccess: () => {
      setSuccess("Invite revoked.");
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to revoke invite");
      setSuccess(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (targetId: number) => removeMember(targetId),
    onSuccess: () => {
      setSuccess("Member removed. Their content stays with the team.");
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to remove member");
      setSuccess(null);
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: () => deleteTeam(),
    onSuccess: () => {
      setSuccess("Team deleted.");
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete team");
      setSuccess(null);
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading team...</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        <p className="text-destructive">You must be logged in to view your team.</p>
        <Link to="/login" className="text-primary hover:underline">
          Go to login
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">
          You are not part of a team yet. Creating a team lets you share sets, templates, and
          generated images with teammates.
        </p>
        <Link to="/profile" className="text-primary hover:underline">
          Manage your profile
        </Link>
      </div>
    );
  }

  const { team, members, invites, role } = data;
  const currentUserId = authUser.id;
  const isAdministrator = role === "admin";

  function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    inviteMutation.mutate();
  }

  function handleCopyLink(link: string) {
    copyText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          You are {ROLE_LABELS[role ?? ""] ?? "a member"} of {team.name}.
        </p>
      </div>

      {(error || success) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-emerald-600/30 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Everyone in {team.name} can see and use shared assets.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {members.map((member) => {
              const isOwner = member.id === team.ownerUserId;
              return (
                <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {member.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.username}
                        {member.id === currentUserId ? " (you)" : ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(
                        member.role
                      )}`}
                    >
                      {ROLE_LABELS[member.role ?? ""] ?? "Viewer"}
                      {isOwner ? " · Owner" : ""}
                    </span>
                    {isAdministrator && !isOwner && member.id !== currentUserId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(member.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {isAdministrator && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Invite members</CardTitle>
              <CardDescription>
                Generate an invite link. Optional email restricts the invite to one address.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteSubmit} className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="inviteEmail" className="text-sm font-medium">
                      Email (optional)
                    </label>
                    <input
                      id="inviteEmail"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="inviteRole" className="text-sm font-medium">
                      Role
                    </label>
                    <select
                      id="inviteRole"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? "Creating..." : "Create invite link"}
                  </Button>
                  {copied && <span className="text-sm text-emerald-600">Link copied</span>}
                </div>
              </form>

              {invites.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium">Pending invites</h3>
                  <ul className="mt-2 flex flex-col divide-y">
                    {invites.map((invite) => (
                      <li key={invite.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm">
                            {invite.email ?? "Anyone with the link"} ·{" "}
                            {ROLE_LABELS[invite.role] ?? "Viewer"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            Expires {new Date(invite.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {invite.link && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyLink(invite.link!)}
                            >
                              Copy link
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(invite.id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team settings</CardTitle>
              <CardDescription>Rename or delete your team.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  renameMutation.mutate();
                }}
                className="flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder={team.name}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="submit" variant="outline" disabled={renameMutation.isPending}>
                  {renameMutation.isPending ? "Renaming..." : "Rename team"}
                </Button>
              </form>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deleting the team detaches every member and drops pending invites. Member content
                  stays with its owners.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="mt-3"
                  disabled={deleteTeamMutation.isPending}
                  onClick={() => {
                    if (window.confirm("Delete the whole team? This cannot be undone.")) {
                      deleteTeamMutation.mutate();
                    }
                  }}
                >
                  {deleteTeamMutation.isPending ? "Deleting..." : "Delete team"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}