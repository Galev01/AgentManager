export function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-IL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function msToMinutes(ms: number): number { return Math.round(ms / 60000); }
export function minutesToMs(minutes: number): number { return minutes * 60000; }
