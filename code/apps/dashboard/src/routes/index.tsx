import { useEffect } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { getUser } from "@/lib/api/profile"
import { getSets } from "@/lib/api/sets"
import { getTemplates } from "@/lib/api/templates"

export const Route = createFileRoute("/")({ component: DashboardPage })

function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" })
    }
  }, [user, authLoading, navigate])

  const userId = user?.id

  const {
    data: profileData,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getUser(userId!),
    enabled: !!userId,
  })

  const { data: setsData, isLoading: setsLoading, error: setsError } = useQuery({
    queryKey: ["sets"],
    queryFn: getSets,
    enabled: !!userId,
  })

  const { data: templatesData, isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ["templates"],
    queryFn: getTemplates,
    enabled: !!userId,
  })

  const profile = profileData?.user.profile
  const displayName = profile?.displayName ?? user?.username ?? "there"
  const loading = authLoading || profileLoading || setsLoading || templatesLoading
  const hasError = profileError || setsError || templatesError

  if (authLoading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your workspace.
        </p>
      </div>

      {hasError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Something went wrong loading your data. Please refresh the page or try again later.
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sets" value={setsData?.sets?.length ?? 0} to="/sets" />
          <StatCard label="Templates" value={templatesData?.templates?.length ?? 0} to="/templates" />
          <StatCard label="Brand colors" value={Object.keys(profile?.brandColors ?? {}).length} to="/profile" />
          <StatCard label="Social links" value={Object.keys(profile?.socialLinks ?? {}).length} to="/profile" />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Jump to the most common tasks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link to="/sets" className={buttonVariants()}>Manage sets</Link>
            <Link to="/templates" className={buttonVariants({ variant: "outline" })}>Templates</Link>
            <Link to="/ai" className={buttonVariants({ variant: "outline" })}>AI Studio</Link>
            <Link to="/profile" className={buttonVariants({ variant: "outline" })}>Edit profile</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brand snapshot</CardTitle>
            <CardDescription>Your current brand palette.</CardDescription>
          </CardHeader>
          <CardContent>
            {profile?.brandColors && Object.keys(profile.brandColors).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(profile.brandColors).map(([name, value]) => (
                  <div
                    key={name}
                    className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm"
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ backgroundColor: value }}
                    />
                    <span className="font-medium">{name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No brand colors yet. <Link to="/profile" className="text-primary hover:underline">Add them in your profile</Link>.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {!user.onboardingCompleted && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Finish setting up your account</CardTitle>
            <CardDescription>
              Complete your profile to get the most out of the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/profile" className={buttonVariants()}>Complete profile</Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="group">
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex flex-col p-4">
          <span className="text-2xl font-semibold transition-colors group-hover:text-primary">{value}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </CardContent>
      </Card>
    </Link>
  )
}
