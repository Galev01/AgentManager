interface LoadingRowProps {
  /** If set, renders as a `<tr>` with a colspan'd skeleton cell (table context). */
  colSpan?: number;
  /** Number of skeleton rows to render when `colSpan` is provided (default 3). */
  rows?: number;
  /** Optional label shown alongside the pulsing dot (non-table form). */
  label?: string;
}

/**
 * Skeleton/loading indicator.
 *
 * - With `colSpan`: emits `rows` × `<tr>` skeletons for use inside a `<tbody>`.
 * - Without `colSpan`: emits a single inline row with a pulsing dot + label
 *   (suitable for card/section skeletons).
 */
export function LoadingRow({ colSpan, rows = 3, label = "Loading\u2026" }: LoadingRowProps) {
  if (colSpan != null) {
    return (
      <>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="skel-row">
            <td colSpan={colSpan}>
              <div className="skel" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        color: "var(--text-muted)",
        fontSize: 12.5,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--accent)",
          boxShadow: "0 0 0 3px var(--accent-dim)",
          animation: "pulse 1.4s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
