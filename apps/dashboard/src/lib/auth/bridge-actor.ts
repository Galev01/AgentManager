import { resolveCurrentSession } from "./current-user";
import { signActorAssertion } from "./assertion";

export async function actorHeaders(): Promise<Record<string, string>> {
  const s = await resolveCurrentSession();
  if (!s) return {};
  return { "x-ocm-actor": signActorAssertion({ sub: s.user.id, sid: s.sid, username: s.user.username }) };
}
