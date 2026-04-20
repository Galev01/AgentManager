"use client";

import { useState } from "react";
import type { YoutubeSummaryMeta } from "@openclaw-manager/types";
import { SummaryTab } from "./tabs/SummaryTab";
import { ChatTab } from "./tabs/ChatTab";
import { ChaptersTab } from "./tabs/ChaptersTab";
import { HighlightsTab } from "./tabs/HighlightsTab";
import { RawTab } from "./tabs/RawTab";

type TabKey = "summary" | "chat" | "chapters" | "highlights" | "raw";

const TABS: { key: TabKey; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "chat", label: "Chat" },
  { key: "chapters", label: "Chapters" },
  { key: "highlights", label: "Highlights" },
  { key: "raw", label: "Raw" },
];

type Props = {
  videoId: string;
  initialMeta: YoutubeSummaryMeta | null;
  initialMarkdown: string;
};

export function YoutubeDetailTabs({
  videoId,
  initialMeta,
  initialMarkdown,
}: Props) {
  const [active, setActive] = useState<TabKey>("summary");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="seg" role="tablist" aria-label="YouTube detail tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            className={active === t.key ? "on" : ""}
            onClick={() => setActive(t.key)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" hidden={active !== "summary"}>
        {active === "summary" && (
          <SummaryTab
            videoId={videoId}
            initialMeta={initialMeta}
            initialMarkdown={initialMarkdown}
          />
        )}
      </div>
      <div role="tabpanel" hidden={active !== "chat"}>
        {active === "chat" && <ChatTab videoId={videoId} />}
      </div>
      <div role="tabpanel" hidden={active !== "chapters"}>
        {active === "chapters" && <ChaptersTab videoId={videoId} />}
      </div>
      <div role="tabpanel" hidden={active !== "highlights"}>
        {active === "highlights" && <HighlightsTab videoId={videoId} />}
      </div>
      <div role="tabpanel" hidden={active !== "raw"}>
        {active === "raw" && <RawTab videoId={videoId} />}
      </div>
    </div>
  );
}
