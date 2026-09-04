import { useState, useEffect } from "react";
import { type Node } from "@xyflow/react";

interface NodeConfigPanelProps {
  node: Node | null;
  templates: Array<{ name: string }>;
  onClose: () => void;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
}

export function NodeConfigPanel({ node, templates, onClose, onSave }: NodeConfigPanelProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) {
      setConfig((node.data as any)?.config ?? {});
    }
  }, [node]);

  if (!node) return null;

  const nodeType = node.type as string;

  const handleSave = () => {
    onSave(node.id, config);
    onClose();
  };

  return (
    <div className="fixed right-0 top-0 z-50 h-full w-80 border-l bg-background shadow-lg">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold capitalize">{nodeType} Config</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {nodeType === "template" && (
            <TemplateConfig config={config} setConfig={setConfig} templates={templates} />
          )}
          {nodeType === "destination" && (
            <DestinationConfig config={config} setConfig={setConfig} />
          )}
          {nodeType === "record" && (
            <div className="text-sm text-muted-foreground">
              Record nodes trigger on entry add/edit. No configuration needed.
            </div>
          )}
          {nodeType === "delete" && (
            <div className="text-sm text-muted-foreground">
              Delete nodes fire when a record is removed. Connect to a destination to send notifications.
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <button
            onClick={handleSave}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateConfig({
  config,
  setConfig,
  templates,
}: {
  config: Record<string, unknown>;
  setConfig: (config: Record<string, unknown>) => void;
  templates: Array<{ name: string }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Template</label>
        <select
          value={(config.templateName as string) ?? ""}
          onChange={(e) => setConfig({ ...config, templateName: e.target.value })}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select template...</option>
          {templates.map((t) => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Width (px)</label>
          <input
            type="number"
            value={(config.widthPx as number) ?? 1200}
            onChange={(e) => setConfig({ ...config, widthPx: parseInt(e.target.value) || 1200 })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Height (px)</label>
          <input
            type="number"
            value={(config.heightPx as number) ?? 800}
            onChange={(e) => setConfig({ ...config, heightPx: parseInt(e.target.value) || 800 })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function DestinationConfig({
  config,
  setConfig,
}: {
  config: Record<string, unknown>;
  setConfig: (config: Record<string, unknown>) => void;
}) {
  const destinationType = (config.type as string) ?? "webhook";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Destination Type</label>
        <select
          value={destinationType}
          onChange={(e) => setConfig({ ...config, type: e.target.value })}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="webhook">Webhook (HTTP POST)</option>
          <option value="email">Email (SMTP)</option>
          <option value="s3">S3 / GCS</option>
        </select>
      </div>

      {destinationType === "webhook" && (
        <div>
          <label className="mb-1 block text-sm font-medium">Webhook URL</label>
          <input
            type="url"
            value={(config.url as string) ?? ""}
            onChange={(e) => setConfig({ ...config, url: e.target.value })}
            placeholder="https://example.com/webhook"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-2">
            <label className="mb-1 block text-sm font-medium">Custom Headers (JSON)</label>
            <textarea
              value={(config.headers as string) ?? "{}"}
              onChange={(e) => setConfig({ ...config, headers: e.target.value })}
              placeholder='{"Authorization": "Bearer token"}'
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              rows={3}
            />
          </div>
        </div>
      )}

      {destinationType === "email" && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium">SMTP Host</label>
            <input
              type="text"
              value={(config.smtpHost as string) ?? ""}
              onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
              placeholder="smtp.gmail.com"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Port</label>
              <input
                type="number"
                value={(config.smtpPort as number) ?? 587}
                onChange={(e) => setConfig({ ...config, smtpPort: parseInt(e.target.value) || 587 })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Encryption</label>
              <select
                value={(config.encryption as string) ?? "tls"}
                onChange={(e) => setConfig({ ...config, encryption: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="tls">TLS</option>
                <option value="ssl">SSL</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Username</label>
            <input
              type="text"
              value={(config.username as string) ?? ""}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              value={(config.password as string) ?? ""}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Recipients (comma-separated)</label>
            <input
              type="text"
              value={(config.recipients as string) ?? ""}
              onChange={(e) => setConfig({ ...config, recipients: e.target.value })}
              placeholder="user@example.com, admin@example.com"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Subject</label>
            <input
              type="text"
              value={(config.subject as string) ?? ""}
              onChange={(e) => setConfig({ ...config, subject: e.target.value })}
              placeholder="New image generated for {{ record.name }}"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Body (Markdown)</label>
            <textarea
              value={(config.body as string) ?? ""}
              onChange={(e) => setConfig({ ...config, body: e.target.value })}
              placeholder="Generated image for {{ record.name }}..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={4}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Image Delivery</label>
            <select
              value={(config.imageDelivery as string) ?? "attachment"}
              onChange={(e) => setConfig({ ...config, imageDelivery: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="attachment">Attachment</option>
              <option value="inline">Inline</option>
              <option value="link">Link only</option>
            </select>
          </div>
        </>
      )}

      {destinationType === "s3" && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium">Provider</label>
            <select
              value={(config.provider as string) ?? "s3"}
              onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="s3">AWS S3</option>
              <option value="gcs">Google Cloud Storage</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Bucket</label>
            <input
              type="text"
              value={(config.bucket as string) ?? ""}
              onChange={(e) => setConfig({ ...config, bucket: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Region</label>
            <input
              type="text"
              value={(config.region as string) ?? ""}
              onChange={(e) => setConfig({ ...config, region: e.target.value })}
              placeholder="us-east-1"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Path Prefix</label>
            <input
              type="text"
              value={(config.pathPrefix as string) ?? ""}
              onChange={(e) => setConfig({ ...config, pathPrefix: e.target.value })}
              placeholder="images/"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Access Key ID</label>
            <input
              type="text"
              value={(config.accessKeyId as string) ?? ""}
              onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Secret Access Key</label>
            <input
              type="password"
              value={(config.secretAccessKey as string) ?? ""}
              onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}
