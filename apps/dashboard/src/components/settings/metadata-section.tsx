"use client";

import Link from "next/link";
import type { RuntimeSettingsV2 } from "@openclaw-manager/types";
import { formatTimestamp } from "@/lib/format";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  KV,
} from "@/components/ui";

interface Props {
  settings: RuntimeSettingsV2;
}

export function MetadataSection({ settings }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime metadata</CardTitle>
        <Link href="/config" style={{ marginLeft: "auto" }}>
          <Button variant="ghost" className="btn-sm">
            Open raw config →
          </Button>
        </Link>
      </CardHeader>
      <CardBody>
        <KV
          items={[
            { label: "Last updated", value: formatTimestamp(settings.updatedAt) },
            { label: "Updated by", value: settings.updatedBy || "system" },
            { label: "Recipients configured", value: String(settings.relayRecipients.length) },
            { label: "Routing rules", value: String(settings.routingRules.length) },
          ]}
        />
      </CardBody>
    </Card>
  );
}
