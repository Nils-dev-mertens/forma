import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getTemplateVersions,
  restoreTemplateVersion,
  updateTemplate,
  type TemplateVersion,
} from "@/lib/api/templates";

export const Route = createFileRoute("/templates/$name")({ component: TemplatePage });

function TemplatePage() {
  const { name } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["template-versions", name],
    queryFn: () => getTemplateVersions(name),
  });

  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () => updateTemplate(name, draft, note || undefined),
    onSuccess: () => {
      setSaveError(null);
      void queryClient.invalidateQueries({ queryKey: ["template-versions", name] });
    },
    onError: (err) => setSaveError(err instanceof Error ? err.message : "Failed to save"),
  });

  const restoreMutation = useMutation({
    mutationFn: (version: number) => restoreTemplateVersion(name, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["template-versions", name] });
    },
  });

  const versions: TemplateVersion[] = data?.versions ?? [];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold break-all">{name}</h1>
          <p className="text-sm text-muted-foreground">Template history and rollback.</p>
        </div>
        <Link to="/templates" className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Save a new version</CardTitle>
          <CardDescription>
            Editing records the current content as a new version. Paste updated HTML and save.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="<div>updated template</div>"
            className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. 'fixed brand colors')"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || draft.trim() === ""}
            >
              {updateMutation.isPending ? "Saving..." : "Save version"}
            </Button>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>Newest first. Restore copies a version's content into a new version.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load versions.</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3"
                >
                  <div>
                    <p className="font-medium">v{v.version}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.note ? `${v.note} · ` : ""}
                      {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoreMutation.isPending}
                    onClick={() => restoreMutation.mutate(v.version)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
