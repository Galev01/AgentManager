import { requirePermission } from "@/lib/auth/current-user";
import { bridgeTailAudit } from "@/lib/auth/bridge-auth-client";

export default async function Page(props: { searchParams: Promise<{ limit?: string }> }) {
  const s = await requirePermission("auth.audit.read");
  const { limit } = await props.searchParams;
  const n = Math.max(1, Math.min(Number(limit) || 100, 500));
  const entries = await bridgeTailAudit(s.user.id, s.sid, s.user.username, n);
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-text-primary">Audit log</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted">
            <th>Time</th>
            <th>Kind</th>
            <th>Actor</th>
            <th>Target</th>
            <th>Meta</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-t border-dark-border align-top">
              <td className="mono text-xs">{e.at.slice(0, 19)}</td>
              <td className="mono text-xs">{e.kind}</td>
              <td className="text-xs">{e.actorUsername ?? e.actorUserId ?? "—"}</td>
              <td className="text-xs">{e.targetUsername ?? e.targetUserId ?? "—"}</td>
              <td className="text-xs">
                <code>{e.meta ? JSON.stringify(e.meta) : ""}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
