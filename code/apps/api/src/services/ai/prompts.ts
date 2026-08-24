import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getProfileByUserId,
  decodeProfileBrandColors,
  decodeProfileSocialLinks,
  decodeProfileCustomData,
  type Profile,
} from "@repo/db";

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

  return {
    displayName: profile.displayName
      ? `{{ profile.displayName }} = ${profile.displayName}`
      : "",
    tagline: profile.tagline
      ? `{{ profile.tagline }} = ${profile.tagline}`
      : "",
    brandColors: formatProfileTokens("brandColors", decodeProfileBrandColors(profile)),
    socialLinks: formatProfileTokens("socialLinks", decodeProfileSocialLinks(profile)),
    customData: formatProfileTokens("customData", decodeProfileCustomData(profile)),
    logo: profile.logo ? `{{ profile.logo }} = ${profile.logo}` : "",
  };
}

// Render a decoded profile map as "<placeholder> = <value>" lines so the model
// copies the exact {{ profile.* }} token verbatim into the template.
function formatProfileTokens(namespace: string, map: Record<string, unknown>): string {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) =>
        `{{ profile.${namespace}.${k} }} = ${typeof v === "string" ? v : JSON.stringify(v)}`,
    )
    .join("\n");
}

function buildBrandContextBlock(context: ProfileContext): string {
  const sections: string[] = [];
  if (context.displayName.trim() !== "") {
    sections.push(
      `- Display name (use this placeholder in the template):\n  ${context.displayName.trim()}`,
    );
  }
  if (context.tagline.trim() !== "") {
    sections.push(
      `- Tagline (use this placeholder in the template):\n  ${context.tagline.trim()}`,
    );
  }
  if (context.brandColors.trim() !== "") {
    sections.push(
      `- Brand colors (reference each with its {{ profile.brandColors.<name> }} placeholder, e.g. style="background-color: {{ profile.brandColors.primary }}"):\n  ${context.brandColors.split("\n").join("\n  ")}`,
    );
  }
  if (context.socialLinks.trim() !== "") {
    sections.push(
      `- Social links (use their {{ profile.socialLinks.<name> }} placeholders):\n  ${context.socialLinks.split("\n").join("\n  ")}`,
    );
  }
  if (context.customData.trim() !== "") {
    sections.push(
      `- Custom data (use their {{ profile.customData.<name> }} placeholders):\n  ${context.customData.split("\n").join("\n  ")}`,
    );
  }
  if (context.logo.trim() !== "") {
    sections.push(
      `- Logo (use this placeholder in the template):\n  ${context.logo.trim()}`,
    );
  }
  return sections.join("\n");
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
