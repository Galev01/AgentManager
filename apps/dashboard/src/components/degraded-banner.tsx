export function DegradedBanner() {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: "var(--radius)",
        border: "1px solid oklch(0.80 0.14 75 / 0.35)",
        background: "var(--warn-dim)",
        color: "var(--warn)",
        fontSize: 12.5,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--warn)", boxShadow: "0 0 0 3px oklch(0.80 0.14 75 / 0.25)" }} />
      <span style={{ fontWeight: 500 }}>Bridge connection lost</span>
      <span style={{ opacity: 0.85 }}>— data may be stale</span>
    </div>
  );
}
