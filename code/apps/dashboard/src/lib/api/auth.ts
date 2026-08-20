import { apiFetch } from "./core";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  success: true;
  user: AuthUser;
}

export async function registerUser(username: string, email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export async function loginUser(username: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutUser(): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentUser(): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/me");
}

export async function completeOnboarding(data: {
  displayName?: string;
  company?: string;
  title?: string;
}): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/api/auth/onboarding", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
