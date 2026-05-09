import net from "node:net";

export function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

export async function pickFreePort(preferred: number, host = "127.0.0.1"): Promise<number> {
  if (await isPortFree(preferred, host)) return preferred;
  for (let p = preferred + 1; p < preferred + 50; p++) {
    if (await isPortFree(p, host)) return p;
  }
  throw new Error(`No free port found near ${preferred}`);
}
