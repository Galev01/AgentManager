"use client";
import { useState } from "react";
import { MessageTimeline } from "./message-timeline";
import { LogViewer } from "./log-viewer";
import { Card, SectionTitle } from "./ui";
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
    <Card>
      <SectionTitle
        right={
          <div className="tabs">
            {(["messages", "logs"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`tab ${activeTab === tab ? "on" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        }
      >
        {activeTab === "messages" ? "Messages" : "Logs"}
      </SectionTitle>
      <div style={{ padding: 18 }}>
        {activeTab === "messages" && <MessageTimeline events={events} />}
        {activeTab === "logs" && <LogViewer conversationKey={conversationKey} />}
      </div>
    </Card>
  );
}
