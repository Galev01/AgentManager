import Link from "next/link";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

export function RuntimeCard({
  descriptor,
  healthy,
}: {
  descriptor: RuntimeDescriptor;
  healthy: boolean | null;
}) {
  const dot =
    healthy === true
      ? "bg-emerald-500"
      : healthy === false
        ? "bg-red-500"
        : "bg-neutral-500";
  return (
    <Link
      href={`/runtimes/${encodeURIComponent(descriptor.id)}`}
      className="block border border-neutral-800 hover:border-neutral-600 rounded-lg p-4 bg-neutral-900/40"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-wide text-neutral-400">
            {descriptor.kind}
          </div>
          <div className="text-lg font-semibold text-neutral-100">
            {descriptor.displayName}
          </div>
          <div className="text-xs text-neutral-500 mt-1">{descriptor.endpoint}</div>
        </div>
        <div
          className={`w-3 h-3 rounded-full ${dot}`}
          aria-label={
            healthy === true ? "healthy" : healthy === false ? "unhealthy" : "unknown"
          }
        />
      </div>
    </Link>
  );
}
