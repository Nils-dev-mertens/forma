import { apiFetch } from "./core";

export interface Profile {
  displayName: string | null;
  tagline: string | null;
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
  tagline?: string;
  brandColors?: Record<string, string | undefined>;
  socialLinks?: Record<string, string | undefined>;
  customData?: Record<string, unknown>;
}

// Build a flat record of the user's profile values using the same `profile.*`
// keys the server uses when rendering (e.g. `profile.displayName`,
// `profile.brandColors.primary`). Used to fill `{{ profile.* }}` placeholders in
// template previews from the brand profile.
export function buildProfilePreviewData(
  profile: Profile | null | undefined,
): Record<string, string> {
  const data: Record<string, string> = {};
  if (!profile) return data;
  if (profile.displayName) data["profile.displayName"] = profile.displayName;
  if (profile.tagline) data["profile.tagline"] = profile.tagline;
  if (profile.logo) data["profile.logo"] = profile.logo;
  for (const [key, value] of Object.entries(profile.brandColors ?? {})) {
    if (value) data[`profile.brandColors.${key}`] = value;
  }
  for (const [key, value] of Object.entries(profile.socialLinks ?? {})) {
    if (value) data[`profile.socialLinks.${key}`] = value;
  }
  for (const [key, value] of Object.entries(profile.customData ?? {})) {
    if (typeof value === "string") data[`profile.customData.${key}`] = value;
    else if (typeof value === "number" || typeof value === "boolean") {
      data[`profile.customData.${key}`] = String(value);
    }
  }
  return data;
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
