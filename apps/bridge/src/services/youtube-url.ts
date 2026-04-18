const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(id: string): boolean {
  return VIDEO_ID_RE.test(id);
}

/**
 * Extracts the 11-character YouTube video id from any common URL form.
 * Throws with a user-readable message on invalid input — the route layer
 * surfaces this verbatim.
 */
export function parseVideoId(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) throw new Error("empty url");

  if (isValidVideoId(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("not a youtube video url");
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    if (id && isValidVideoId(id)) return id;
    throw new Error("not a youtube video url");
  }

  if (host !== "youtube.com" && host !== "youtube-nocookie.com") {
    throw new Error("not a youtube video url");
  }

  if (url.pathname === "/playlist") {
    throw new Error("playlist urls are not supported — submit individual videos");
  }

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    if (id && isValidVideoId(id)) return id;
    throw new Error("not a youtube video url");
  }

  const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
  if (shortsMatch && isValidVideoId(shortsMatch[1]!)) return shortsMatch[1]!;

  const embedMatch = url.pathname.match(/^\/embed\/([^/?#]+)/);
  if (embedMatch && isValidVideoId(embedMatch[1]!)) return embedMatch[1]!;

  throw new Error("not a youtube video url");
}
