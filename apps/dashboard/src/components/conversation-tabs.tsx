"use client";
import { useState } from "react";
import { MessageTimeline } from "./message-timeline";
import { LogViewer } from "./log-viewer";
import type { ConversationEvent } from "@openclaw-manager/types";

type Tab = "messages" | "logs";

export function ConversationTabs({
  conversationKey,
  events,
}: {
  conversationKey: string;
  events: ConversationEvent[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("messages");

  return (
    <div className="rounded bg-dark-card shadow-card-dark">
      {/* Tab Header */}
      <div className="flex border-b border-dark-border">
        {(["messages", "logs"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-4 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text-gray"
            }`}
          >
            {tab === "messages" ? "Messages" : "Logs"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "messages" && <MessageTimeline events={events} />}
        {activeTab === "logs" && <LogViewer conversationKey={conversationKey} />}
      </div>
    </div>
  );
}
