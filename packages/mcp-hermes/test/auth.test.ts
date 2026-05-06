import { describe, it, expect, vi } from "vitest";
import { bearerAuth } from "../src/auth.js";

function makeReq(headers: Record<string, string>) {
  return { headers } as any;
}
function makeRes() {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const end = vi.fn();
  return { status, json, end } as any;
}

describe("bearerAuth", () => {
  const mw = bearerAuth("secret-token");

  it("passes through with correct bearer", () => {
    const req = makeReq({ authorization: "Bearer secret-token" });
    const res = makeRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 with no header", () => {
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 with wrong token", () => {
    const req = makeReq({ authorization: "Bearer nope" });
    const res = makeRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 500 if expected token is empty", () => {
    const mw0 = bearerAuth("");
    const req = makeReq({ authorization: "Bearer anything" });
    const res = makeRes();
    const next = vi.fn();
    mw0(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
