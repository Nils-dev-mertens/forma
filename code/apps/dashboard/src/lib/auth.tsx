import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  completeOnboarding,
  type AuthUser,
} from "./api/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  finishOnboarding: (data: {
    displayName?: string;
    tagline?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string) => {
    const data = await loginUser(username, password);
    setUser(data.user);
    redirectAfterAuth(data.user);
  };

  const register = async (username: string, email: string, password: string) => {
    const data = await registerUser(username, email, password);
    setUser(data.user);
    redirectAfterAuth(data.user);
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    navigate({ to: "/login" });
  };

  const finishOnboarding = async (data: {
    displayName?: string;
    tagline?: string;
  }) => {
    await completeOnboarding(data);
    setUser((prev) => (prev ? { ...prev, onboardingCompleted: true } : prev));
    navigate({ to: "/dashboard" });
  };

  function redirectAfterAuth(user: AuthUser) {
    if (!user.onboardingCompleted) {
      navigate({ to: "/onboarding" });
    } else {
      navigate({ to: "/dashboard" });
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout, finishOnboarding }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
