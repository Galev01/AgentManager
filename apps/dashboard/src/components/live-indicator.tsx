"use client";

type Props = {
  status: "connecting" | "connected" | "disconnected";
};

const colors = {
  connected: "bg-green-500",
  connecting: "bg-yellow-500 animate-pulse",
  disconnected: "bg-red-500",
} as const;

const labels = {
  connected: "Live",
  connecting: "Connecting...",
  disconnected: "Offline",
} as const;

export function LiveIndicator({ status }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}
