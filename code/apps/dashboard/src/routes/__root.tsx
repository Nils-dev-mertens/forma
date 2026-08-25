import { useState } from "react"
import { HeadContent, Scripts, createRootRoute, Link } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { QueryClientProvider, QueryClient } from "@tanstack/react-query"
import { AuthProvider, useAuth } from "@/lib/auth"

import appCss from "../styles.css?url"

const queryClient = new QueryClient()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Forma" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto flex min-h-svh flex-col items-center justify-center p-4 text-center">
      <h1 className="text-4xl font-semibold">404</h1>
      <p className="text-muted-foreground">The requested page could not be found.</p>
      <Link to="/" className="mt-4 text-primary hover:underline">
        Go to dashboard
      </Link>
    </main>
  ),
  shellComponent: RootDocument,
})

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/sets", label: "Sets" },
  { to: "/templates", label: "Templates" },
  { to: "/profile", label: "Profile" },
  { to: "/ai", label: "AI Studio" },
  { to: "/ai-logs", label: "AI Logs" },
]

function Navigation() {
  const { user, logout, isLoading } = useAuth()

  return (
    <nav className="border-b bg-card px-4 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Forma
          </Link>
          <ul className="hidden flex-wrap items-center gap-1 text-sm font-medium md:flex">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="rounded-md px-3 py-1.5 text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                  activeProps={{ className: "bg-accent text-foreground font-medium" }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <MobileNav />

        <div className="flex items-center gap-3 text-sm">
          {isLoading ? null : user ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[120px] truncate text-muted-foreground sm:inline">
                {user.username}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                className="rounded-md px-3 py-1.5 text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-md px-3 py-1.5 text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-md p-2 text-foreground/70 hover:bg-accent hover:text-foreground"
        aria-label="Toggle navigation"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-14 z-50 border-b bg-card px-4 py-3 shadow-sm">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                  activeProps={{ className: "bg-accent text-foreground font-medium" }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Navigation />
            {children}
            <TanStackDevtools
              config={{ position: "bottom-right" }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          </AuthProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
