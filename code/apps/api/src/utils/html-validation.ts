import { load } from "cheerio";

export interface HtmlValidationResult {
  valid: boolean;
  errors: string[];
}

const FORBIDDEN_TAGS = new Set(["script", "iframe", "object", "embed", "link"]);
const EXTERNAL_URL_PATTERN = /^(?:https?:|javascript:|data:text\/html|\/\/)/i;
const EVENT_HANDLER_PATTERN = /^on\w+/i;

export function validateHtml(html: string): HtmlValidationResult {
  const errors: string[] = [];

  if (typeof html !== "string") {
    errors.push("HTML must be a string");
    return { valid: false, errors };
  }

  const trimmed = html.trim();
  if (trimmed.length === 0) {
    errors.push("HTML is empty");
    return { valid: false, errors };
  }

  let $: ReturnType<typeof load>;
  try {
    $ = load(trimmed, {
      // Use the lower-level parser directly to avoid cheerio adding missing
      // html/body wrappers, which keeps validation focused on the fragment.
      _useHtmlParser2: true,
    } as any);
  } catch (parseError) {
    errors.push(
      parseError instanceof Error
        ? `Failed to parse HTML: ${parseError.message}`
        : "Failed to parse HTML"
    );
    return { valid: false, errors };
  }

  // Check forbidden tags.
  FORBIDDEN_TAGS.forEach((tag) => {
    if ($(tag).length > 0) {
      errors.push(`Forbidden tag found: <${tag}>`);
    }
  });

  // Check attributes on every element using cheerio helpers so we don't rely
  // on internal node shapes.
  $("*").each((_, element) => {
    const $element = $(element);
    const attributes = $element.attr();
    if (!attributes) return;

    Object.entries(attributes).forEach(([name, value]) => {
      if (EVENT_HANDLER_PATTERN.test(name)) {
        errors.push(`Inline event handler attribute not allowed: ${name}`);
      }

      const lowerValue = String(value).trim();
      const checkAttributes = ["src", "href", "action", "formaction", "poster", "background"];
      if (checkAttributes.includes(name.toLowerCase()) && lowerValue.length > 0) {
        if (EXTERNAL_URL_PATTERN.test(lowerValue)) {
          errors.push(`External or unsafe URL not allowed in ${name}: ${lowerValue}`);
        }
      }
    });
  });

  // Check <style> blocks for @import with external URLs.
  $("style").each((_, styleElement) => {
    const styleContent = $(styleElement).html() ?? "";
    if (/@import\s+(?:url\s*\(\s*)?["']?(https?:|\/\/)/i.test(styleContent)) {
      errors.push("External @import inside <style> is not allowed");
    }
    if (/url\s*\(\s*["']?(https?:|\/\/)/i.test(styleContent)) {
      errors.push("External url() inside <style> is not allowed");
    }
  });

  return { valid: errors.length === 0, errors };
}
