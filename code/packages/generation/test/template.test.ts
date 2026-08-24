import { describe, expect, test } from "bun:test";
import { validateTemplateData, fillTemplate } from "../src/template";

describe("validateTemplateData", () => {
  test("requires template-specific fields but not profile.* fields", () => {
    const html =
      '<div style="background:{{ profile.brandColors.primary }}"><img src="{{ profile.logo }}">{{ headline }}</div>';

    // No entry data at all: profile.* placeholders are trusted and skipped,
    // but the template-specific `headline` must be present.
    const onlyProfileMissing = validateTemplateData(html, {
      records: {},
    });
    expect(onlyProfileMissing.valid).toBe(false);
    expect(onlyProfileMissing.missing).toEqual(["headline"]);

    // Providing the template-specific field passes even with empty profile.*.
    const withEntry = validateTemplateData(html, {
      records: { headline: "Hello" },
    });
    expect(withEntry.valid).toBe(true);
    expect(withEntry.missing).toEqual([]);
  });

  test("fillTemplate leaves absent profile.* empty", () => {
    const html = "<p>{{ profile.displayName }}</p><p>{{ name }}</p>";
    const out = fillTemplate(html, { records: { name: "Ada" } });
    expect(out).toBe("<p></p><p>Ada</p>");
  });
});
