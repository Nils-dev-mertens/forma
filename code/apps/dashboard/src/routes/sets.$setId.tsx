import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createEntry, deleteEntry, getEntries, getSet, updateEntry, updateSet, deleteSet, testHook, type SetHook, type DisplayHook } from "@/lib/api/sets";
import { getTemplates } from "@/lib/api/templates";
import { buildProfilePreviewData, getUser, type Profile } from "@/lib/api/profile";
import { useAuth } from "@/lib/auth";
import { TemplatePreview } from "@/components/TemplatePreview";
import { WorkflowCanvas } from "@/components/WorkflowCanvas";
import { WorkflowRunPanel } from "@/components/workflow/WorkflowRunPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sets/$setId")({ component: SetDetailPage });

function SetDetailPage() {
  const { setId } = Route.useParams();
  const setIdNumber = Number(setId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [hookWarning, setHookWarning] = useState<string | null>(null);
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");
  const [hooks, setHooks] = useState<SetHook[]>([]);
  const [hookDisplay, setHookDisplay] = useState<Record<string, string>>({});
  const [newHookUrl, setNewHookUrl] = useState("");
  const [newHookAdd, setNewHookAdd] = useState(true);
  const [newHookModify, setNewHookModify] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [hookTest, setHookTest] = useState<string | null>(null);
  const [rightPanelRatio, setRightPanelRatio] = useState<"1/2" | "1/3" | "2/3">("1/2");

  const { user } = useAuth();

  const { data: setData, isLoading: setLoading } = useQuery({
    queryKey: ["set", setIdNumber],
    queryFn: () => getSet(setIdNumber),
  });

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ["entries", setIdNumber],
    queryFn: () => getEntries(setIdNumber, { withImages: true }),
  });

  const { data: userData } = useQuery({
    queryKey: ["user", user?.id],
    queryFn: () => getUser(user!.id),
    enabled: !!user?.id,
  });

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: () => getTemplates(),
  });

  // Sample/prop data for the live preview: the user's profile fills
  // `{{ profile.* }}` placeholders, and the entry form values fill the
  // template-specific placeholders. This is what makes the template-specific
  // `{{ }}` render even before an entry is saved.
  const profile = userData?.user.profile ?? (null as Profile | null);
  const previewData: Record<string, string> = {
    ...buildProfilePreviewData(profile),
    ...formData,
  };
  const templateContents =
    templatesData?.templates.filter((t) =>
      setData?.set.templates.includes(t.name),
    ) ?? [];

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createEntry(setIdNumber, data),
    onSuccess: (data) => {
      setFormData({});
      setEditingEntryId(null);
      setError(null);
      const failures = (data as { triggers?: { hookFailures?: unknown[] } }).triggers?.hookFailures;
      setHookWarning(failures && failures.length > 0 ? "Warning: one or more export hooks failed after rendering." : null);
      void queryClient.invalidateQueries({ queryKey: ["entries", setIdNumber] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create entry");
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      updateEntry(setIdNumber, editingEntryId!, data),
    onSuccess: (data) => {
      setFormData({});
      setEditingEntryId(null);
      setError(null);
      const failures = (data as { triggers?: { hookFailures?: unknown[] } }).triggers?.hookFailures;
      setHookWarning(failures && failures.length > 0 ? "Warning: one or more export hooks failed after rendering." : null);
      void queryClient.invalidateQueries({ queryKey: ["entries", setIdNumber] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: number) => deleteEntry(setIdNumber, entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["entries", setIdNumber] });
    },
  });

  // Keep the set-settings inputs in sync with the loaded set.
  useEffect(() => {
    if (setData?.set) {
      setSetName(setData.set.name);
      setSetDescription(setData.set.description ?? "");
    }
  }, [setData]);

  // Mirror the set's configured hooks. Existing hooks arrive with a masked
  // config (no plaintext secrets); we keep them as config-less entries so a
  // save preserves the server-stored config rather than clobbering it.
  useEffect(() => {
    const incoming = setData?.set.hooks ?? [];
    setHooks(
      incoming.map((h: DisplayHook) => ({
        id: h.id,
        type: h.type,
        events: h.events,
        config: {},
      })),
    );
    const display: Record<string, string> = {};
    for (const h of incoming) {
      if (typeof h.config.url === "string") display[h.id] = h.config.url;
    }
    setHookDisplay(display);
  }, [setData]);

  const updateHooksMutation = useMutation({
    mutationFn: (next: SetHook[]) => updateSet(setIdNumber, { hooks: next }),
    onSuccess: () => {
      setHookError(null);
      setNewHookUrl("");
      setNewHookAdd(true);
      setNewHookModify(false);
      void queryClient.invalidateQueries({ queryKey: ["set", setIdNumber] });
    },
    onError: (err) => {
      setHookError(err instanceof Error ? err.message : "Failed to update hooks");
    },
  });

  function addHook() {
    const url = newHookUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setHookError("Enter a valid http(s) webhook URL");
      return;
    }
    const events: ("add" | "modify")[] = [];
    if (newHookAdd) events.push("add");
    if (newHookModify) events.push("modify");
    if (events.length === 0) {
      setHookError("Select at least one event (add or modify)");
      return;
    }
    const next: SetHook[] = [
      ...hooks,
      { id: crypto.randomUUID(), type: "webhook", events, config: { url } },
    ];
    updateHooksMutation.mutate(next);
  }

  function removeHook(id: string) {
    updateHooksMutation.mutate(hooks.filter((h) => h.id !== id));
  }

  async function testSendHook() {
    const url = newHookUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setHookError("Enter a valid http(s) webhook URL to test");
      return;
    }
    const events: ("add" | "modify")[] = [];
    if (newHookAdd) events.push("add");
    if (newHookModify) events.push("modify");
    if (events.length === 0) {
      setHookError("Select at least one event (add or modify)");
      return;
    }
    setHookTest(null);
    try {
      const res = await testHook(setIdNumber, {
        id: "test",
        type: "webhook",
        events,
        config: { url },
      });
      setHookTest(res.delivered ? "Delivered successfully" : `Failed: ${res.error ?? "unknown error"}`);
    } catch (err) {
      setHookTest(err instanceof Error ? err.message : "Test send failed");
    }
  }

  const updateSetMutation = useMutation({
    mutationFn: () =>
      updateSet(setIdNumber, {
        name: setName.trim(),
        description: setDescription.trim(),
      }),
    onSuccess: () => {
      setSettingsError(null);
      void queryClient.invalidateQueries({ queryKey: ["set", setIdNumber] });
      void queryClient.invalidateQueries({ queryKey: ["sets"] });
    },
    onError: (err) => {
      setSettingsError(err instanceof Error ? err.message : "Failed to update set");
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: () => deleteSet(setIdNumber),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sets"] });
      void navigate({ to: "/sets" });
    },
    onError: (err) => {
      setSettingsError(err instanceof Error ? err.message : "Failed to delete set");
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
    if (editingEntryId !== null) {
      updateEntryMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  function startEditEntry(entry: { id: number; data: Record<string, unknown> }) {
    const next: Record<string, string> = {};
    for (const field of setData?.set.fields ?? []) {
      const value = entry.data[field.fieldname];
      if (value === undefined) continue;
      next[field.fieldname] =
        field.type === "boolean" ? (value ? "true" : "false") : String(value);
    }
    setFormData(next);
    setEditingEntryId(entry.id);
    setError(null);
  }

  function cancelEditEntry() {
    setFormData({});
    setEditingEntryId(null);
    setError(null);
  }

  const fields = setData?.set.fields ?? [];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left panel - inputs/config */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="flex flex-col gap-4">
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
              <CardTitle>Live preview</CardTitle>
              <CardDescription>
                Shows the template with your profile values and the entry fields filled
                in below. Empty fields render blank.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {templateContents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No template content to preview.
                </p>
              ) : (
                templateContents.map((template) => (
                  <div key={template.name} className="flex flex-col gap-1">
                    <label className="text-sm font-medium">{template.name}</label>
                    <TemplatePreview html={template.content} data={previewData} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingEntryId !== null ? "Edit entry" : "Add entry"}</CardTitle>
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
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateEntryMutation.isPending}
                    >
                      {editingEntryId !== null
                        ? updateEntryMutation.isPending
                          ? "Saving..."
                          : "Save changes"
                        : createMutation.isPending
                          ? "Adding..."
                          : "Add entry"}
                    </Button>
                    {editingEntryId !== null && (
                      <Button type="button" variant="outline" onClick={cancelEditEntry}>
                        Cancel
                      </Button>
                    )}
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
                      <div className="min-w-0 flex-1">
                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                          {JSON.stringify(entry.data, null, 2)}
                        </pre>
                        {entry.images && entry.images.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-3">
                            {entry.images.map((img) => {
                              let templateName = img.template;
                              if (!templateName && img.generationData) {
                                try {
                                  templateName = JSON.parse(img.generationData).template;
                                } catch {
                                  templateName = undefined;
                                }
                              }
                              return (
                                <div key={img.name} className="flex flex-col gap-1">
                                  <img
                                    src={`/api/photos/${img.name}`}
                                    alt={templateName ?? img.name}
                                    className="h-auto w-48 rounded-md border border-input bg-white"
                                  />
                                  {templateName ? (
                                    <span className="text-xs text-muted-foreground">
                                      {templateName}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-muted-foreground">
                            No rendered images yet.
                          </p>
                        )}
                      </div>
                      <div className="ml-4 flex shrink-0 flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditEntry(entry)}
                          disabled={editingEntryId === entry.id}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Set settings</CardTitle>
              <CardDescription>Update this set's name or description, or delete it.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <input
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                placeholder="Set name"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={setDescription}
                onChange={(e) => setSetDescription(e.target.value)}
                placeholder="Description (optional)"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => updateSetMutation.mutate()}
                  disabled={updateSetMutation.isPending || !setName.trim()}
                >
                  {updateSetMutation.isPending ? "Saving..." : "Save set"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Delete this set and all its entries and images?")) {
                      deleteSetMutation.mutate();
                    }
                  }}
                  disabled={deleteSetMutation.isPending}
                >
                  {deleteSetMutation.isPending ? "Deleting..." : "Delete set"}
                </Button>
              </div>
              {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export hooks</CardTitle>
              <CardDescription>
                Send the rendered images somewhere after an entry is added or modified.
                Webhook (HTTP POST) is supported now; email and storage are coming next.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {hooks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No export hooks configured.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {hooks.map((hook) => (
                    <li
                      key={hook.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize">{hook.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {hook.events.join(", ")}
                          {hookDisplay[hook.id] ? ` · ${hookDisplay[hook.id]}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeHook(hook.id)}
                        disabled={updateHooksMutation.isPending}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-2 border-t pt-3">
                <p className="text-sm font-medium">Add webhook</p>
                <input
                  value={newHookUrl}
                  onChange={(e) => setNewHookUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={newHookAdd}
                      onChange={(e) => setNewHookAdd(e.target.checked)}
                    />
                    on add
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={newHookModify}
                      onChange={(e) => setNewHookModify(e.target.checked)}
                    />
                    on modify
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={addHook}
                    disabled={updateHooksMutation.isPending}
                  >
                    {updateHooksMutation.isPending ? "Saving..." : "Save webhook"}
                  </Button>
                  <Button type="button" variant="outline" onClick={testSendHook}>
                    Test send
                  </Button>
                </div>
                {hookTest && <p className="text-xs text-muted-foreground">{hookTest}</p>}
                {hookError && <p className="text-sm text-destructive">{hookError}</p>}
              </div>

              {hookWarning && (
                <p className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-700">
                  {hookWarning}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resize handle */}
      <div className="w-1 cursor-col-resize bg-border hover:bg-foreground/20 transition-colors" />

      {/* Right panel - workflow canvas */}
      <div
        className={cn(
          "flex flex-col overflow-hidden border-l",
          rightPanelRatio === "1/3" && "w-1/3",
          rightPanelRatio === "1/2" && "w-1/2",
          rightPanelRatio === "2/3" && "w-2/3"
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h3 className="text-sm font-medium">Workflow</h3>
          <div className="flex gap-1">
            {(["1/3", "1/2", "2/3"] as const).map((ratio) => (
              <Button
                key={ratio}
                variant={rightPanelRatio === ratio ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setRightPanelRatio(ratio)}
              >
                {ratio}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="flex flex-col gap-4">
            <WorkflowCanvas setId={setIdNumber} />
            <WorkflowRunPanel setId={setIdNumber} />
          </div>
        </div>
      </div>
    </div>
  );
}
