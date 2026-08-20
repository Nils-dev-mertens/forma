import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getUser, updateProfile, uploadProfileLogo } from "@/lib/api/profile";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profile/")({ component: ProfilePage });

const MIN_BRAND_COLORS = 2;
const MAX_BRAND_COLORS = 5;

function sanitizeRecord(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([k, v]) => [k.trim(), v.trim()] as const)
      .filter(([k, v]) => k !== "" && v !== "")
  );
}

function isHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(normalizeHex(value));
}

function normalizeHex(value: string): string {
  const trimmed = value.trim();
  if (/^#/.test(trimmed)) return trimmed;
  if (/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed}`;
  return trimmed;
}

interface ColorSwatch {
  id: string;
  name: string;
  value: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function ProfilePage() {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const userId = authUser?.id;

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getUser(userId!),
    enabled: !!userId,
  });

  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [twitter, setTwitter] = useState("");
  const [customDataPairs, setCustomDataPairs] = useState<{ key: string; value: string }[]>([]);
  const [brandColors, setBrandColors] = useState<ColorSwatch[]>([
    { id: generateId(), name: "primary", value: "#0f172a" },
    { id: generateId(), name: "secondary", value: "#3b82f6" },
  ]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [hasSeeded, setHasSeeded] = useState(false);

  useEffect(() => {
    if (!hasSeeded && data?.user.profile) {
      const profile = data.user.profile;
      setDisplayName(profile.displayName ?? "");
      setTitle(profile.title ?? "");
      setCompany(profile.company ?? "");
      setWebsite(profile.socialLinks?.website ?? "");
      setLinkedin(profile.socialLinks?.linkedin ?? "");
      setTwitter(profile.socialLinks?.twitter ?? "");

      const custom = profile.customData ?? {};
      const pairs = Object.entries(custom).map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      }));
      setCustomDataPairs(pairs.length > 0 ? pairs : [{ key: "", value: "" }]);

      const loadedColors = Object.entries(profile.brandColors ?? {});
      if (loadedColors.length >= MIN_BRAND_COLORS) {
        setBrandColors(
          loadedColors.map(([name, value]) => ({ id: generateId(), name, value: value ?? "" }))
        );
      }

      setHasSeeded(true);
    }
  }, [data, hasSeeded]);

  function validateBrandColors(): string | null {
    if (brandColors.length < MIN_BRAND_COLORS) {
      return `Add at least ${MIN_BRAND_COLORS} brand colors.`;
    }
    if (brandColors.length > MAX_BRAND_COLORS) {
      return `You can have at most ${MAX_BRAND_COLORS} brand colors.`;
    }
    const names = new Set<string>();
    for (const color of brandColors) {
      if (!color.name.trim()) return "Each brand color needs a name.";
      if (!isHexColor(color.value.trim())) return `"${color.name}" must be a valid hex color (e.g. #3b82f6).`;
      if (names.has(color.name.trim().toLowerCase())) {
        return `Duplicate color name "${color.name}".`;
      }
      names.add(color.name.trim().toLowerCase());
    }
    return null;
  }

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Not authenticated");

      const validationError = validateBrandColors();
      if (validationError) throw new Error(validationError);

      const brandColorsRecord: Record<string, string> = {};
      for (const color of brandColors) {
        brandColorsRecord[color.name.trim()] = normalizeHex(color.value.trim()).toLowerCase();
      }

      const socialLinks = sanitizeRecord({
        website,
        linkedin,
        twitter,
      });

      const seenKeys = new Set<string>();
      const customData: Record<string, string> = {};
      for (const pair of customDataPairs) {
        const key = pair.key.trim();
        if (!key) continue;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        customData[key] = pair.value;
      }

      return updateProfile(userId, {
        displayName: displayName.trim() || undefined,
        title: title.trim() || undefined,
        company: company.trim() || undefined,
        brandColors: brandColorsRecord,
        socialLinks,
        customData,
      });
    },
    onSuccess: () => {
      setSuccess("Profile updated.");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update profile");
      setSuccess(null);
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadProfileLogo(userId!, file),
    onSuccess: () => {
      setLogoFile(null);
      setSuccess("Logo uploaded.");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
      setSuccess(null);
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.mutate();
  }

  function handleLogoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!logoFile) {
      setError("Please select a logo file");
      return;
    }
    logoMutation.mutate(logoFile);
  }

  function addBrandColor() {
    setBrandColors((prev) => {
      if (prev.length >= MAX_BRAND_COLORS) return prev;
      return [...prev, { id: generateId(), name: "", value: "#000000" }];
    });
  }

  function updateBrandColor(id: string, updates: Partial<ColorSwatch>) {
    setBrandColors((prev) =>
      prev.map((color) => (color.id === id ? { ...color, ...updates } : color))
    );
  }

  function removeBrandColor(id: string) {
    setBrandColors((prev) => prev.filter((color) => color.id !== id));
  }

  function addCustomDataRow() {
    setCustomDataPairs((prev) => [...prev, { key: "", value: "" }]);
  }

  function updateCustomDataRow(index: number, key: string, value: string) {
    setCustomDataPairs((prev) => {
      const next = [...prev];
      next[index] = { key, value };
      return next;
    });
  }

  function removeCustomDataRow(index: number) {
    setCustomDataPairs((prev) => prev.filter((_, i) => i !== index));
  }

  const profile = data?.user.profile;

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        <p className="text-destructive">You must be logged in to view your profile.</p>
        <Link to="/login" className="text-primary hover:underline">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your identity, brand palette, and social links.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>How you appear across the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="displayName" className="text-sm font-medium">
                  Display name
                </label>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="title" className="text-sm font-medium">
                  Title
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Product Designer"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="company" className="text-sm font-medium">
                  Company
                </label>
                <input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Brand palette</h3>
                  <p className="text-xs text-muted-foreground">
                    {MIN_BRAND_COLORS}–{MAX_BRAND_COLORS} colors
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBrandColor}
                  disabled={brandColors.length >= MAX_BRAND_COLORS}
                >
                  Add color
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {brandColors.map((color) => (
                  <div
                    key={color.id}
                    className="flex items-center gap-3 rounded-md border border-input p-2"
                  >
                    <input
                      type="color"
                      value={isHexColor(color.value) ? normalizeHex(color.value) : "#000000"}
                      onChange={(e) => updateBrandColor(color.id, { value: e.target.value })}
                      className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input bg-background"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Name</label>
                      <input
                        value={color.name}
                        onChange={(e) => updateBrandColor(color.id, { name: e.target.value })}
                        placeholder="e.g. primary"
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Hex</label>
                    <input
                      value={normalizeHex(color.value)}
                      onChange={(e) => updateBrandColor(color.id, { value: e.target.value })}
                      onBlur={(e) => updateBrandColor(color.id, { value: normalizeHex(e.target.value) })}
                      placeholder="#3b82f6"
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBrandColor(color.id)}
                      disabled={brandColors.length <= MIN_BRAND_COLORS}
                      className="shrink-0"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium">Social links</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="website" className="text-xs text-muted-foreground">
                    Website
                  </label>
                  <input
                    id="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="linkedin" className="text-xs text-muted-foreground">
                    LinkedIn
                  </label>
                  <input
                    id="linkedin"
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="linkedin.com/in/..."
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="twitter" className="text-xs text-muted-foreground">
                    Twitter / X
                  </label>
                  <input
                    id="twitter"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="@handle"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Custom data</h3>
                <Button type="button" variant="outline" size="sm" onClick={addCustomDataRow}>
                  Add field
                </Button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {customDataPairs.map((pair, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={pair.key}
                      onChange={(e) => updateCustomDataRow(index, e.target.value, pair.value)}
                      placeholder="Key"
                      className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <input
                      value={pair.value}
                      onChange={(e) => updateCustomDataRow(index, pair.key, e.target.value)}
                      placeholder="Value"
                      className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => removeCustomDataRow(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save profile"}
              </Button>
              {success && <span className="text-sm text-emerald-600">{success}</span>}
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Upload a logo for your profile.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile?.logo ? (
            <p className="mb-2 text-sm text-muted-foreground">Current logo: {profile.logo}</p>
          ) : null}
          <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" disabled={logoMutation.isPending || !logoFile}>
              {logoMutation.isPending ? "Uploading..." : "Upload logo"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
