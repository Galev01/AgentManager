import { Sparkline } from "./sparkline";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  spark?: number[];
  accent?: string;
}

export function StatCard({ label, value, unit, sub, spark, accent }: StatCardProps) {
  const up = sub != null && sub.includes("+") && !sub.includes("-");
  const dn = sub != null && sub.includes("-");

  return (
    <div className="stat">
      <div className="stat-h">
        <span className="stat-l">{label}</span>
      </div>
      <div className="stat-v mono">
        {value}
        {unit && <em>{unit}</em>}
      </div>
      {spark && spark.length >= 2 && (
        <Sparkline data={spark} color={accent ?? "var(--accent)"} />
      )}
      {sub && (
        <div className="stat-sub">
          <span className={up ? "up" : dn ? "dn" : ""}>{sub}</span>
        </div>
      )}
    </div>
  );
}
