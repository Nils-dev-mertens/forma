import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getTemplates, uploadTemplate } from "@/lib/api/templates";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/templates/")({ component: TemplatesPage });

function TemplatesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => getTemplates(),
  });

  const uploadMutation = useMutation({
    mutationFn: uploadTemplate,
    onSuccess: () => {
      setFile(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to upload template");
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please select a template file");
      return;
    }
    uploadMutation.mutate(file);
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Manage your HTML templates or upload new ones.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload new template</CardTitle>
          <CardDescription>Choose an HTML template file to upload.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              type="file"
              accept=".html"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" disabled={uploadMutation.isPending || !file}>
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your templates</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading templates...</p>
          ) : data?.templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data?.templates.map((template) => (
                <li
                  key={template.id}
                  className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
                >
                  <Link to="/templates/$name" params={{ name: template.name }}>
                    <p className="font-medium">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(template.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
