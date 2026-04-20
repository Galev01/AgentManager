import type { ConversationEvent } from "@openclaw-manager/types";
import { formatTimestamp } from "@/lib/format";
import { EmptyState } from "./ui";

function EventBubble({ event }: { event: ConversationEvent }) {
  const isInbound = event.type === "message_in";
  const isOutbound = event.type === "message_out";
  const isSystem = !isInbound && !isOutbound;

  if (isSystem) {
    return (
      <div className="msg-sys">
        <span className="line" />
        <span>
          {event.type.replace(/_/g, " ")}
          {event.text ? `: ${event.text}` : ""}
          <span style={{ marginLeft: 8, opacity: 0.7 }}>{formatTimestamp(event.at)}</span>
        </span>
        <span className="line" />
      </div>
    );
  }

  return (
    <div className={`msg ${isInbound ? "them" : "us"}`}>
      {event.displayName && <div className="msg-meta">{event.displayName}</div>}
      <div>{event.text}</div>
      <div className="msg-meta" style={{ marginTop: 4 }}>
        {formatTimestamp(event.at)}
      </div>
    </div>
  );
}

export function MessageTimeline({ events }: { events: ConversationEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No messages yet" description="This thread has no recorded events." />;
  }
  const chronological = [...events].reverse();
  return (
    <div
      className="thread"
      style={{
        background: "transparent",
        padding: 0,
        gap: 10,
        maxHeight: "60vh",
        overflowY: "auto",
      }}
    >
      {chronological.map((event) => (
        <EventBubble key={event.id} event={event} />
      ))}
    </div>
  );
}
