// Normalize various phone/JID inputs to E.164 "+<digits>" or null if not usable.
// Examples:
//   "+972501234567"                      -> "+972501234567"
//   "972501234567@s.whatsapp.net"        -> "+972501234567"
//   "972501234567:12@s.whatsapp.net"     -> "+972501234567"
//   "972-50-123-4567"                    -> "+972501234567"

const JID_RE = /^(\d{6,15})(?::\d+)?@[a-z0-9.\-]+$/i;

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const jidMatch = raw.match(JID_RE);
  if (jidMatch) return `+${jidMatch[1]}`;

  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = "+" + digits.slice(1).replace(/\D/g, "");
  else digits = digits.replace(/\D/g, "");

  if (digits.startsWith("+")) {
    const n = digits.slice(1);
    if (n.length < 6 || n.length > 15) return null;
    return `+${n}`;
  }
  if (digits.length < 6 || digits.length > 15) return null;
  return `+${digits}`;
}

export function jidForPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}
