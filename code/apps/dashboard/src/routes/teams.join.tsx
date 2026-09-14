import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { acceptInvite } from "@/lib/api/team";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/teams/join")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useSearch();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token!),
    onSuccess: () => {
      navigate({ to: "/teams" });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to join the team");
    },
  });

  useEffect(() => {
    if (!authLoading && user && token) {
      setError(null);
      acceptMutation.mutate();
    }
  }, [authLoading, user, token]);

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Invalid invite</CardTitle>
            <CardDescription>This invite link is missing its token. Ask for a fresh one.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/" })}>
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join a team</CardTitle>
          <CardDescription>
            {user
              ? "Accept the invite to start collaborating."
              : "Log in or create an account to accept this invite."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!user && (
            <>
              <Button type="button" onClick={() => navigate({ to: "/login" })}>
                Log in
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigate({ to: "/register", search: { inviteToken: token } })
                }
              >
                Create an account
              </Button>
            </>
          )}
          {user && (
            <Button type="button" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate()}>
              {acceptMutation.isPending ? "Joining..." : "Accept invite"}
            </Button>
          )}
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/" className="text-primary hover:underline">
              Back to dashboard
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}