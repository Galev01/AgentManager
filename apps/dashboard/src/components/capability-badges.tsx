import type { CapabilitySnapshot, PartialCapability } from "@openclaw-manager/types";

function pill(id: string, cls: string, key: string) {
  return (
    <span key={key} className={`text-xs px-2 py-0.5 rounded border ${cls}`}>
      {id}
    </span>
  );
}

function partialPill(p: PartialCapability) {
  return (
    <span
      key={p.id}
      title={`${p.reason} (${p.projectionMode}, ${p.lossiness})`}
      className="text-xs px-2 py-0.5 rounded border border-amber-700 text-amber-300 bg-amber-900/20 cursor-help"
    >
      {p.id} <span className="text-amber-500/70">• {p.projectionMode}</span>
    </span>
  );
}

export function CapabilityBadges({ snapshot }: { snapshot: CapabilitySnapshot }) {
  return (
    <div className="space-y-3">
      {snapshot.supported.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            Supported
          </div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.supported.map((id) =>
              pill(id, "border-emerald-700 text-emerald-300 bg-emerald-900/20", id),
            )}
          </div>
        </div>
      )}
      {snapshot.partial.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            Partial
          </div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.partial.map((p) => partialPill(p))}
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">
            Hover a partial badge to see why the projection is lossy.
          </div>
        </div>
      )}
      {snapshot.unsupported.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            Unsupported
          </div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.unsupported.map((id) =>
              pill(id, "border-neutral-700 text-neutral-500 bg-neutral-900/20", id),
            )}
          </div>
        </div>
      )}
      <div className="text-xs text-neutral-500">
        Adapter contract {snapshot.version}
        {snapshot.runtimeVersion ? ` · runtime ${snapshot.runtimeVersion}` : ""}
      </div>
    </div>
  );
}
