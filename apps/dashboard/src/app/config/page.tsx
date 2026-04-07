import { AppShell } from "@/components/app-shell";
import { ConfigEditor } from "@/components/config-editor";
import { getGatewayConfig, getGatewayConfigSchema } from "@/lib/bridge-client";
import type { ConfigSchema } from "@openclaw-manager/types";

export const metadata = { title: "Configuration" };

export default async function ConfigPage() {
  let schema: ConfigSchema = { properties: {} };
  let values: Record<string, unknown> = {};

  try {
    [schema, values] = await Promise.all([
      getGatewayConfigSchema(),
      getGatewayConfig(),
    ]);
  } catch {
    // bridge unavailable — show empty config
  }

  return (
    <AppShell title="Configuration">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Configuration</h1>
          <p className="mt-1 text-sm text-zinc-400">
            View and edit gateway configuration. Use Save to persist changes, then Apply to activate them.
          </p>
        </div>
        <ConfigEditor schema={schema} values={values} />
      </div>
    </AppShell>
  );
}
