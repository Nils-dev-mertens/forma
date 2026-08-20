import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getProfileByUserId, profileToRecords, type Profile } from "@repo/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_PROMPTS = ["template"];

export interface ProfileContext {
  displayName: string;
  tagline: string;
  brandColors: string;
  socialLinks: string;
  customData: string;
  logo: string;
}

export async function buildProfileContext(userId: number): Promise<ProfileContext> {
  const profile = await getProfileByUserId(userId);
  if (!profile) {
    return {
      displayName: "",
      tagline: "",
      brandColors: "{}",
      socialLinks: "{}",
      customData: "{}",
      logo: "",
    };
  }

  const records = profileToRecords(profile);

  return {
    displayName: profile.displayName ?? records["profile.displayName"] ?? "",
    tagline: profile.tagline ?? records["profile.tagline"] ?? "",
    brandColors: profile.brandColors ?? "{}",
    socialLinks: profile.socialLinks ?? "{}",
    customData: profile.customData ?? "{}",
    logo: profile.logo ?? records["profile.logo"] ?? "",
  };
}

function buildBrandContextBlock(context: ProfileContext): string {
  const lines: string[] = [];
  if (context.displayName.trim() !== "") {
    lines.push(`- Display name: ${context.displayName.trim()}`);
  }
  if (context.tagline.trim() !== "") {
    lines.push(`- Tagline: ${context.tagline.trim()}`);
  }
  if (context.brandColors.trim() !== "" && context.brandColors.trim() !== "{}") {
    lines.push(`- Brand colors: ${context.brandColors.trim()}`);
  }
  if (context.socialLinks.trim() !== "" && context.socialLinks.trim() !== "{}") {
    lines.push(`- Social links: ${context.socialLinks.trim()}`);
  }
  if (context.customData.trim() !== "" && context.customData.trim() !== "{}") {
    lines.push(`- Custom data: ${context.customData.trim()}`);
  }
  if (context.logo.trim() !== "") {
    lines.push(`- Logo: ${context.logo.trim()}`);
  }
  return lines.join("\n");
}

export async function loadSystemPrompt(
  name: string,
  userId: number,
): Promise<string> {
  if (!ALLOWED_PROMPTS.includes(name)) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  const path = join(__dirname, "..", "..", "prompts", `${name}.md`);
  const raw = await readFile(path, "utf-8");
  const context = await buildProfileContext(userId);
  const brandContext = buildBrandContextBlock(context);
  return raw.replace(
    /{{brandContext}}/g,
    brandContext || "No brand information has been set up yet — design a clean, generic template the user can customize later.",
  );
}
