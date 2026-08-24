import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createSet, getSets, type SetField } from "@/lib/api/sets";
import { getTemplates, getTemplateFields } from "@/lib/api/templates";

export const Route = createFileRoute("/sets/")({ component: SetsPage });

const FIELD_TYPES = ["string", "number", "boolean", "image"] as const;

function inferFieldType(name: string): SetField["type"] {
  return /image|logo|photo|picture|img|banner|avatar/i.test(name) ? "image" : "string";
}

function SetsPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [fields, setFields] = useState<SetField[]>([]);
  // Tracks which field names were auto-added from each selected template, so
  // they can be pruned when the template is deselected.
  const [autoFields, setAutoFields] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sets"],
    queryFn: () => getSets(),
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => getTemplates(),
  });

  const createMutation = useMutation({
    mutationFn: createSet,
    onSuccess: () => {
      setName("");
      setDescription("");
      setSelectedTemplates([]);
      setFields([]);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["sets"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create set");
    },
  });

  async function toggleTemplate(templateName: string) {
    if (selectedTemplates.includes(templateName)) {
      setSelectedTemplates((prev) => prev.filter((t) => t !== templateName));

      // Prune fields that came from this template and aren't required by any
      // other still-selected template.
      const names = autoFields[templateName] ?? [];
      const stillNeeded = new Set(
        Object.entries(autoFields)
          .filter(([t]) => t !== templateName)
          .flatMap(([, ns]) => ns),
      );
      setFields((prev) =>
        prev.filter((f) => !(names.includes(f.fieldname) && !stillNeeded.has(f.fieldname))),
      );
      setAutoFields((prev) => {
        const next = { ...prev };
        delete next[templateName];
        return next;
      });
    } else {
      setSelectedTemplates((prev) => [...prev, templateName]);
      try {
        const { fields: names } = await getTemplateFields(templateName);
        setAutoFields((prev) => ({ ...prev, [templateName]: names }));
        setFields((prev) => {
          const existing = new Set(prev.map((f) => f.fieldname));
          const additions = names
            .filter((n) => !existing.has(n))
            .map((n) => ({ fieldname: n, type: inferFieldType(n), required: false }));
          return [...prev, ...additions];
        });
      } catch {
        // Field extraction failed; the user can still add fields manually.
      }
    }
  }

  function addField() {
    setFields((prev) => [...prev, { fieldname: "", type: "string" }]);
  }

  function updateField(index: number, patch: Partial<SetField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (selectedTemplates.length === 0) {
      setError("Select at least one template");
      return;
    }
    const validFields = fields.filter((f) => f.fieldname.trim() !== "");
    if (validFields.length === 0) {
      setError("Add at least one field");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      fields: validFields,
      templates: selectedTemplates,
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Sets</h1>
        <p className="text-sm text-muted-foreground">
          Manage your data sets and their entries.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create a set</CardTitle>
          <CardDescription>
            Pick a name, choose the templates it renders, and the entry fields are
            filled in automatically from each template's placeholders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Set name"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Templates</label>
              {templatesLoading ? (
                <p className="text-sm text-muted-foreground">Loading templates...</p>
              ) : templatesData?.templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No templates. Upload one first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {templatesData?.templates.map((t) => (
                    <label
                      key={t.name}
                      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTemplates.includes(t.name)}
                        onChange={() => toggleTemplate(t.name)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Fields</label>
                <Button type="button" variant="outline" size="sm" onClick={addField}>
                  Add field
                </Button>
              </div>
              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No fields yet. Add at least one.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {fields.map((field, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={field.fieldname}
                      onChange={(e) => updateField(index, { fieldname: e.target.value })}
                      placeholder="fieldname"
                      className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateField(index, { type: e.target.value })}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required ?? false}
                        onChange={(e) =>
                          updateField(index, { required: e.target.checked })
                        }
                      />
                      Required
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={() => removeField(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create set"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your sets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading sets...</p>
          ) : data?.sets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sets yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data?.sets.map((set) => (
                <li
                  key={set.id}
                  className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
                >
                  <Link
                    to="/sets/$setId"
                    params={{ setId: String(set.id) }}
                    className="block"
                  >
                    <p className="font-medium">{set.name}</p>
                    {set.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{set.description}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {set.templates.length} template{set.templates.length === 1 ? "" : "s"}
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
