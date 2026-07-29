import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getProfileByUserId, profileToRecords, type Profile } from "@repo/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_PROMPTS = ["template"];

export interface ProfileContext {
  displayName: string;
  title: string;
  company: string;
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
      title: "",
      company: "",
      brandColors: "{}",
      socialLinks: "{}",
      customData: "{}",
      logo: "",
    };
  }

  const records = profileToRecords(profile);

  return {
    displayName: profile.displayName ?? records["profile.displayName"] ?? "",
    title: profile.title ?? records["profile.title"] ?? "",
    company: profile.company ?? records["profile.company"] ?? "",
    brandColors: profile.brandColors ?? "{}",
    socialLinks: profile.socialLinks ?? "{}",
    customData: profile.customData ?? "{}",
    logo: profile.logo ?? records["profile.logo"] ?? "",
  };
}

function replacePlaceholders(template: string, context: ProfileContext): string {
  return template
    .replace(/{{profile\.displayName}}/g, context.displayName)
    .replace(/{{profile\.title}}/g, context.title)
    .replace(/{{profile\.company}}/g, context.company)
    .replace(/{{profile\.brandColors}}/g, context.brandColors)
    .replace(/{{profile\.socialLinks}}/g, context.socialLinks)
    .replace(/{{profile\.customData}}/g, context.customData)
    .replace(/{{profile\.logo}}/g, context.logo);
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
  return replacePlaceholders(raw, context);
}
