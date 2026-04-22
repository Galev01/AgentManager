import { AppShell } from "@/components/app-shell";
import { ConfigEditor } from "@/components/config-editor";
import { getGatewayConfig, getGatewayConfigSchema } from "@/lib/bridge-client";
import type { GatewayConfigSnapshot } from "@openclaw-manager/types";

export const metadata = { title: "Configuration" };

type RawSchemaResponse = { schema?: Record<string, unknown> } & Record<string, unknown>;

export default async function ConfigPage() {
  let schema: Record<string, unknown> = { type: "object", properties: {} };
  let values: Record<string, unknown> = {};
  let baseHash = "";

  try {
    const [schemaResp, valuesResp] = (await Promise.all([
      getGatewayConfigSchema() as unknown as Promise<RawSchemaResponse>,
      getGatewayConfig(),
    ])) as [RawSchemaResponse, GatewayConfigSnapshot];

    schema =
      (schemaResp?.schema as Record<string, unknown>) ??
      (schemaResp as Record<string, unknown>) ??
      schema;

    values =
      valuesResp?.parsed ??
      valuesResp?.config ??
      valuesResp?.runtimeConfig ??
      {};

    if (typeof valuesResp?.hash === "string") {
      baseHash = valuesResp.hash;
    }
  } catch {
    // bridge unavailable — show empty config
  }

  return (
    <AppShell title="Configuration">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Configuration</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Gateway configuration. Save writes the file; Apply activates it.
          </p>
        </div>
        <ConfigEditor
          schema={schema as any}
          values={values}
          initialBaseHash={baseHash}
        />
      </div>
    </AppShell>
  );
}
