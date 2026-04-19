export type LampStatus = "ok" | "warn" | "err" | "off";

interface StatusLampProps {
  status: LampStatus;
}

export function StatusLamp({ status }: StatusLampProps) {
  return <span className={`dot-lamp ${status}`} style={{ margin: 0 }} />;
}
