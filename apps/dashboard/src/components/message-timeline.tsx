import type { ConversationEvent } from "@openclaw-manager/types";
import { formatTimestamp } from "@/lib/format";

function EventBubble({ event }: { event: ConversationEvent }) {
  const isInbound = event.type === "message_in";
  const isOutbound = event.type === "message_out";
  const isSystem = !isInbound && !isOutbound;

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-pill bg-dark-lighter px-4 py-1 text-xs text-text-muted">
          {event.type.replace(/_/g, " ")}{event.text ? `: ${event.text}` : ""}
          <span className="ml-2 opacity-60">{formatTimestamp(event.at)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-3`}>
      <div className={`max-w-[70%] rounded-lg px-4 py-3 ${isInbound ? "bg-dark-lighter text-text-primary" : "bg-primary/20 text-text-primary"}`}>
        {event.displayName && (
          <p className={`mb-1 text-xs font-medium ${isInbound ? "text-primary" : "text-primary-light"}`}>{event.displayName}</p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{event.text}</p>
        <p className="mt-1 text-right text-xs text-text-muted">{formatTimestamp(event.at)}</p>
      </div>
    </div>
  );
}

export function MessageTimeline({ events }: { events: ConversationEvent[] }) {
  if (events.length === 0) {
    return <div className="py-12 text-center text-text-muted">No messages recorded yet</div>;
  }
  const chronological = [...events].reverse();
  return (
    <div className="space-y-1 py-4">
      {chronological.map((event) => <EventBubble key={event.id} event={event} />)}
    </div>
  );
}
