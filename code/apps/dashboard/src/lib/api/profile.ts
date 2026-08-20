import { apiFetch } from "./core";

export interface Profile {
  displayName: string | null;
  title: string | null;
  company: string | null;
  brandColors: Record<string, string>;
  logo: string | null;
  socialLinks: Record<string, string>;
  customData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithProfile {
  id: number;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  profile: Profile | null;
}

export interface ProfileUpdatePayload {
  displayName?: string;
  title?: string;
  company?: string;
  brandColors?: Record<string, string | undefined>;
  socialLinks?: Record<string, string | undefined>;
  customData?: Record<string, unknown>;
}

export async function getUser(userId: number): Promise<{ success: true; user: UserWithProfile }> {
  return apiFetch<{ success: true; user: UserWithProfile }>(`/api/users/${userId}`);
}

export async function updateProfile(userId: number, payload: ProfileUpdatePayload): Promise<{ success: true; user: UserWithProfile }> {
  return apiFetch<{ success: true; user: UserWithProfile }>(`/api/users/${userId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadProfileLogo(userId: number, file: File): Promise<{ success: true; user: UserWithProfile }> {
  const formData = new FormData();
  formData.append("logo", file);

  const response = await fetch(`/api/users/${userId}/profile/logo`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : response.statusText;
    throw new Error(message);
  }

  return data as { success: true; user: UserWithProfile };
}
