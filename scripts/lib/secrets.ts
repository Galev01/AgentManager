import crypto from "node:crypto";

const WORDS = [
  "amber","banyan","cobalt","dahlia","ember","fjord","ginger","harbor",
  "indigo","juniper","kelp","linden","maple","nebula","ochre","pomegranate",
  "quartz","river","saffron","tundra","umber","violet","willow","xanadu",
  "yarrow","zephyr","azure","beacon","cinder","drift",
] as const;

export function randomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function readablePassword(): string {
  const a = WORDS[crypto.randomInt(WORDS.length)];
  const b = WORDS[crypto.randomInt(WORDS.length)];
  const n = crypto.randomInt(10, 100);
  return `${a}-${b}-${n}`;
}
