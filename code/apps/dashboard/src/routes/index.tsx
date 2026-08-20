import { useEffect } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"

export const Route = createFileRoute("/")({ component: LandingPage })

function LandingPage() {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && user) {
      if (!user.onboardingCompleted) {
        navigate({ to: "/onboarding" })
      } else {
        navigate({ to: "/dashboard" })
      }
    }
  }, [user, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-10 p-6 text-center">
      <div className="max-w-xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Welcome to Forma
        </h1>
        <p className="text-lg text-muted-foreground">
          Generate images, manage templates, organize data sets, and keep your brand
          assets in one place.
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Get started</CardTitle>
          <CardDescription>Log in or create a free account to continue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link to="/login">
            <Button className="w-full">Log in</Button>
          </Link>
          <Link to="/register">
            <Button variant="outline" className="w-full">
              Create account
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        {[
          { title: "Sets", description: "Organize records with flexible fields." },
          { title: "Templates", description: "Build reusable content for generation." },
          { title: "AI Studio", description: "Generate images and copy with AI." },
        ].map((feature) => (
          <Card key={feature.title} className="text-left">
            <CardHeader>
              <CardTitle className="text-base">{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
