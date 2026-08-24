function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapHtmlForPreview(html: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #ffffff;
      }
      *, *::before, *::after { box-sizing: border-box; }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

interface TemplatePreviewProps {
  html: string | null | undefined;
  data: Record<string, string>;
}

// Renders a template (with `{{ placeholder }}` tokens) inside a sandboxed
// iframe. `data` maps placeholder names (e.g. `headline` or `profile.logo`)
// to values; unfilled tokens render empty. Pass the entry's field values plus
// the user's profile so template-specific and `profile.*` placeholders render.
export function TemplatePreview({ html, data }: TemplatePreviewProps) {
  const srcDoc = (() => {
    if (!html) return "";
    const filled = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const value = data[key];
      return value !== undefined && value !== "" ? escapeHtml(String(value)) : "";
    });
    return wrapHtmlForPreview(filled);
  })();

  if (!html) {
    return (
      <p className="text-sm text-muted-foreground">No template content available.</p>
    );
  }

  return (
    <iframe
      title="Template preview"
      sandbox=""
      srcDoc={srcDoc}
      className="h-72 w-full rounded-md border border-input bg-white"
    />
  );
}
