import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  getPlatformTemplates,
  getPlatformTemplate,
  type PlatformTemplate,
  type PlatformTemplateSummary,
} from "@/lib/api/platform-templates";

export const Route = createFileRoute("/platform-templates/")({
  component: PlatformTemplatesPage,
});

function PlatformTemplatesPage() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["platform-templates"],
    queryFn: () => getPlatformTemplates(),
  });

  const copyMutation = useMutation({
    mutationFn: async (template: PlatformTemplate) => {
      const blob = new Blob([template.html], { type: "text/html" });
      const file = new File([blob], `${template.name.replace(/\s+/g, "-").toLowerCase()}.html`, {
        type: "text/html",
      });
      const formData = new FormData();
      formData.append("template", file);
      const response = await fetch("/api/template/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data && typeof data.error === "string" ? data.error : response.statusText,
        );
      }
      return response.json();
    },
    onSuccess: (_data, template) => {
      setCopiedId(template.id);
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      setTimeout(() => setCopiedId(null), 2000);
    },
  });

  function handlePreview(template: PlatformTemplateSummary) {
    setPreviewId(previewId === template.id ? null : template.id);
  }

  const categories = data
    ? [...new Set(data.templates.map((t) => t.category))]
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Platform Templates</h1>
        <p className="text-sm text-muted-foreground">
          Curated templates for common use cases. Preview and copy them to your
          collection to customize.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading templates...</p>
      ) : (
        categories.map((category) => (
          <div key={category}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {category}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data?.templates
                .filter((t) => t.category === category)
                .map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isPreviewOpen={previewId === template.id}
                    onPreview={() => handlePreview(template)}
                    onCopy={() => loadAndCopy(template.id)}
                    isCopying={copyMutation.isPending && copyMutation.variables?.id === template.id}
                    isCopied={copiedId === template.id}
                  />
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );

  async function loadAndCopy(id: string) {
    const result = await getPlatformTemplate(id);
    copyMutation.mutate(result.template);
  }
}

function TemplateCard({
  template,
  isPreviewOpen,
  onPreview,
  onCopy,
  isCopying,
  isCopied,
}: {
  template: PlatformTemplateSummary;
  isPreviewOpen: boolean;
  onPreview: () => void;
  onCopy: () => void;
  isCopying: boolean;
  isCopied: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{template.name}</CardTitle>
        <CardDescription className="text-xs">
          {template.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>
            {template.widthPx} × {template.heightPx}
          </span>
          {template.fields.length > 0 && (
            <span>· {template.fields.length} field{template.fields.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        {isPreviewOpen && (
          <PreviewFrame
            templateId={template.id}
            width={template.widthPx}
            height={template.heightPx}
          />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onPreview}>
            {isPreviewOpen ? "Hide preview" : "Preview"}
          </Button>
          <Button
            size="sm"
            onClick={onCopy}
            disabled={isCopying}
          >
            {isCopied ? "Copied!" : isCopying ? "Copying..." : "Copy to my templates"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewFrame({
  templateId,
  width,
  height,
}: {
  templateId: string;
  width: number;
  height: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-template", templateId],
    queryFn: () => getPlatformTemplate(templateId),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
        Loading preview...
      </div>
    );
  }

  if (!data) return null;

  const scale = Math.min(500 / width, 300 / height, 1);

  return (
    <div className="overflow-hidden rounded-md border">
      <iframe
        srcDoc={data.template.html}
        title={`${templateId} preview`}
        style={{
          width: `${width * scale}px`,
          height: `${height * scale}px`,
          border: "none",
          pointerEvents: "none",
        }}
        sandbox=""
      />
    </div>
  );
}
