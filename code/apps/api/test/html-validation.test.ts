import { describe, it, expect } from "bun:test";
import { validateHtml } from "../src/utils/html-validation.ts";

describe("validateHtml", () => {
  it("accepts a simple static HTML fragment", () => {
    const result = validateHtml("<div class='test'>Hello</div>");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty HTML", () => {
    const result = validateHtml("   ");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("HTML is empty");
  });

  it("rejects script tags", () => {
    const result = validateHtml("<script>alert(1)</script>");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("<script>"))).toBe(true);
  });

  it("rejects iframe tags", () => {
    const result = validateHtml("<iframe src='about:blank'></iframe>");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("<iframe>"))).toBe(true);
  });

  it("rejects inline event handlers", () => {
    const result = validateHtml("<div onclick='alert(1)'>click</div>");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("onclick"))).toBe(true);
  });

  it("rejects external URLs in src", () => {
    const result = validateHtml("<img src='https://example.com/x.png' />");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("External or unsafe URL"))).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    const result = validateHtml("<a href='javascript:alert(1)'>link</a>");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("External or unsafe URL"))).toBe(true);
  });

  it("allows data URIs", () => {
    const result = validateHtml("<img src='data:image/png;base64,abc' />");
    expect(result.valid).toBe(true);
  });

  it("rejects external @import in style", () => {
    const result = validateHtml(
      "<style>@import url('https://example.com/style.css');</style>"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("@import"))).toBe(true);
  });
});
