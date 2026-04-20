import crypto from "node:crypto";

export function chunkId(videoId: string, startSeconds: number): string {
  const bucket = Math.round(startSeconds * 1000);
  return crypto
    .createHash("sha256")
    .update(`${videoId}:${bucket}`)
    .digest("hex")
    .slice(0, 16);
}
