import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createEntry, deleteEntry, getEntries, getSet } from "@/lib/api/sets";

export const Route = createFileRoute("/sets/$setId")({ component: SetDetailPage });

function SetDetailPage() {
  const { setId } = Route.useParams();
  const setIdNumber = Number(setId);
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: setData, isLoading: setLoading } = useQuery({
    queryKey: ["set", setIdNumber],
    queryFn: () => getSet(setIdNumber),
  });

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ["entries", setIdNumber],
    queryFn: () => getEntries(setIdNumber),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createEntry(setIdNumber, data),
    onSuccess: () => {
      setFormData({});
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["entries", setIdNumber] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create entry");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: number) => deleteEntry(setIdNumber, entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["entries", setIdNumber] });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, unknown> = { ...formData };
    for (const field of setData?.set.fields ?? []) {
      if (field.type === "number" && data[field.fieldname] !== undefined) {
        data[field.fieldname] = Number(data[field.fieldname]);
      } else if (field.type === "boolean") {
        data[field.fieldname] = data[field.fieldname] === "true";
      }
    }
    createMutation.mutate(data);
  }

  const fields = setData?.set.fields ?? [];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {setLoading ? (
        <p className="text-sm text-muted-foreground">Loading set...</p>
      ) : setData?.set ? (
        <div>
          <h1 className="text-xl font-semibold">{setData.set.name}</h1>
          {setData.set.description ? (
            <p className="text-sm text-muted-foreground">{setData.set.description}</p>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add entry</CardTitle>
          <CardDescription>Fill in the declared fields for this set.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This set has no fields declared yet.
              </p>
            ) : (
              fields.map((field) => (
                <div key={field.fieldname} className="flex flex-col gap-1">
                  <label className="text-sm font-medium">
                    {field.fieldname}
                    {field.required ? <span className="text-destructive">*</span> : null}
                  </label>
                  {field.type === "boolean" ? (
                    <select
                      value={formData[field.fieldname] ?? "false"}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [field.fieldname]: e.target.value }))
                      }
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      value={formData[field.fieldname] ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [field.fieldname]: e.target.value }))
                      }
                      placeholder={field.fieldname}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  )}
                </div>
              ))
            )}
            {fields.length > 0 && (
              <div>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : "Add entry"}
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <p className="text-sm text-muted-foreground">Loading entries...</p>
          ) : entriesData?.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {entriesData?.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between rounded-lg border bg-card p-4 shadow-sm"
                >
                  <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-4 shrink-0"
                    onClick={() => deleteMutation.mutate(entry.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
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
