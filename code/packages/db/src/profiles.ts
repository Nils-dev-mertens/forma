import { db } from "./client.ts";
import { profiles, type Profile, type NewProfile } from "./schema.ts";
import { eq } from "drizzle-orm";

export interface ProfileBrandColors {
  [key: string]: string | undefined;
}

export interface ProfileSocialLinks {
  website?: string;
  linkedin?: string;
  twitter?: string;
  [key: string]: string | undefined;
}

export interface ProfileCustomData {
  [key: string]: unknown;
}

export interface ProfileData {
  displayName?: string | null;
  title?: string | null;
  company?: string | null;
  brandColors?: ProfileBrandColors;
  logo?: string | null;
  socialLinks?: ProfileSocialLinks;
  customData?: ProfileCustomData;
}

/**
 * Create an empty identity profile for a user.
 * Should be called right after user creation.
 */
export async function createProfile(userId: number): Promise<Profile> {
  const result = await db
    .insert(profiles)
    .values({
      userId,
      displayName: null,
      title: null,
      company: null,
      brandColors: JSON.stringify({}),
      logo: null,
      socialLinks: JSON.stringify({}),
      customData: JSON.stringify({}),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as NewProfile)
    .returning();
  if (!result[0]) {
    throw new Error("Profile insert did not return a row");
  }
  return result[0];
}

/**
 * Get the identity profile for a user.
 */
export async function getProfileByUserId(userId: number): Promise<Profile | null> {
  const result = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Update a user's identity profile.
 * Pass null for logo to remove the logo reference (caller should delete the file).
 */
export async function updateProfile(
  userId: number,
  data: ProfileData,
): Promise<Profile | null> {
  const existing = await getProfileByUserId(userId);
  if (!existing) return null;

  const set: Partial<NewProfile> = {
    updatedAt: new Date(),
  };

  if (data.displayName !== undefined) set.displayName = data.displayName ?? null;
  if (data.title !== undefined) set.title = data.title ?? null;
  if (data.company !== undefined) set.company = data.company ?? null;
  if (data.logo !== undefined) set.logo = data.logo ?? null;
  if (data.brandColors !== undefined) {
    set.brandColors = JSON.stringify(data.brandColors ?? {});
  }
  if (data.socialLinks !== undefined) {
    set.socialLinks = JSON.stringify(data.socialLinks ?? {});
  }
  if (data.customData !== undefined) {
    set.customData = JSON.stringify(data.customData ?? {});
  }

  const result = await db
    .update(profiles)
    .set(set)
    .where(eq(profiles.userId, userId))
    .returning();
  return result[0] ?? null;
}

/**
 * Delete a profile by user ID.
 */
export async function deleteProfile(userId: number): Promise<boolean> {
  const result = await db.delete(profiles).where(eq(profiles.userId, userId)).run();
  // @ts-ignore - changes property exists on the result
  return (result as any).changes > 0;
}

/**
 * Decode the brand colors JSON column.
 */
export function decodeProfileBrandColors(profile: Profile): ProfileBrandColors {
  try {
    const parsed = JSON.parse(profile.brandColors ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ProfileBrandColors)
      : {};
  } catch {
    return {};
  }
}

/**
 * Decode the social links JSON column.
 */
export function decodeProfileSocialLinks(profile: Profile): ProfileSocialLinks {
  try {
    const parsed = JSON.parse(profile.socialLinks ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ProfileSocialLinks)
      : {};
  } catch {
    return {};
  }
}

/**
 * Decode the custom data JSON column.
 */
export function decodeProfileCustomData(profile: Profile): ProfileCustomData {
  try {
    const parsed = JSON.parse(profile.customData ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ProfileCustomData)
      : {};
  } catch {
    return {};
  }
}

/**
 * Build a flat record of profile values suitable for template substitution.
 * Keys are prefixed with "profile." (e.g. profile.brandName).
 * Nested objects (brandColors, socialLinks, customData) are flattened with dot notation.
 */
export function profileToRecords(profile: Profile): Record<string, string> {
  const records: Record<string, string> = {};

  if (profile.displayName) records["profile.displayName"] = profile.displayName;
  if (profile.title) records["profile.title"] = profile.title;
  if (profile.company) records["profile.company"] = profile.company;
  if (profile.logo) records["profile.logo"] = profile.logo;

  const brandColors = decodeProfileBrandColors(profile);
  for (const [key, value] of Object.entries(brandColors)) {
    if (value !== undefined && value !== null) {
      records[`profile.brandColors.${key}`] = value;
    }
  }

  const socialLinks = decodeProfileSocialLinks(profile);
  for (const [key, value] of Object.entries(socialLinks)) {
    if (value !== undefined && value !== null) {
      records[`profile.socialLinks.${key}`] = value;
    }
  }

  const customData = decodeProfileCustomData(profile);
  for (const [key, value] of Object.entries(customData)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      records[`profile.customData.${key}`] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      records[`profile.customData.${key}`] = String(value);
    } else {
      records[`profile.customData.${key}`] = JSON.stringify(value);
    }
  }

  return records;
}
