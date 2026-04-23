import crypto from "node:crypto";
import { promisify } from "node:util";

type ScryptOpts = { N: number; r: number; p: number; maxmem: number };
const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  opts: ScryptOpts,
) => Promise<Buffer>;

const PARAMS = { N: 32768, r: 8, p: 1, keylen: 64 };
const MAXMEM = 128 * 1024 * 1024;
const PREFIX = "scrypt-v1";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, PARAMS.keylen, {
    N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: MAXMEM,
  });
  return [PREFIX, `N=${PARAMS.N}`, `r=${PARAMS.r}`, `p=${PARAMS.p}`, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [prefix, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  if (prefix !== PREFIX) return false;
  const N = Number(nRaw.replace(/^N=/, ""));
  const r = Number(rRaw.replace(/^r=/, ""));
  const p = Number(pRaw.replace(/^p=/, ""));
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer, expected: Buffer;
  try { salt = Buffer.from(saltB64, "base64"); expected = Buffer.from(hashB64, "base64"); }
  catch { return false; }
  const actual = await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAXMEM });
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
