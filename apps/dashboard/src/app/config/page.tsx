import { AppShell } from "@/components/app-shell";
import { ConfigEditor } from "@/components/config-editor";
import { getGatewayConfig, getGatewayConfigSchema } from "@/lib/bridge-client";

export const metadata = { title: "Configuration" };

type RawSchemaResponse = { schema?: Record<string, unknown> } & Record<string, unknown>;
type RawConfigResponse = {
  parsed?: Record<string, unknown>;
  config?: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
} & Record<string, unknown>;

export default async function ConfigPage() {
  let schema: Record<string, unknown> = { type: "object", properties: {} };
  let values: Record<string, unknown> = {};

  try {
    const [schemaResp, valuesResp] = (await Promise.all([
      getGatewayConfigSchema() as unknown as Promise<RawSchemaResponse>,
      getGatewayConfig() as unknown as Promise<RawConfigResponse>,
    ])) as [RawSchemaResponse, RawConfigResponse];

    schema =
      (schemaResp?.schema as Record<string, unknown>) ??
      (schemaResp as Record<string, unknown>) ??
      schema;

    values =
      (valuesResp?.parsed as Record<string, unknown>) ??
      (valuesResp?.config as Record<string, unknown>) ??
      (valuesResp?.runtimeConfig as Record<string, unknown>) ??
      {};
  } catch {
    // bridge unavailable — show empty config
  }

  return (
    <AppShell title="Configuration">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Configuration</h1>
          <p className="mt-1 text-sm text-zinc-400">
            View and edit gateway configuration. Use Save to persist changes, then Apply to activate them.
          </p>
        </div>
        <ConfigEditor schema={schema as any} values={values} />
      </div>
    </AppShell>
  );
}
