export function DegradedBanner() {
  return (
    <div className="mb-6 rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      <span className="mr-2 font-medium">Bridge connection lost</span>
      <span className="text-warning/80">— data may be stale</span>
    </div>
  );
}
