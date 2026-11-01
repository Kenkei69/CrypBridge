import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
export async function callGuard(
  endpoint: string,
  body: unknown,
  authenticationReference?: string,
) {
  const token = authenticationReference
    ? /^GUARD_SECRET_[A-Z0-9_]+$/.test(authenticationReference)
      ? process.env[authenticationReference]
      : undefined
    : process.env.GUARD_API_TOKEN;
  if (authenticationReference && !token)
    throw Error("Guard credential reference is unavailable");
  return postPublicJson(
    endpoint,
    body,
    (process.env.GUARD_ALLOWED_ORIGINS || "").split(","),
    token,
  );
}
export async function postPublicJson(
  endpoint: string,
  body: unknown,
  allowedOrigins: string[],
  token?: string,
) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !allowedOrigins.includes(url.origin)
  )
    throw Error("Guard origin not allowed");
  const records = await lookup(url.hostname, { all: true });
  const publicV4 = (ip: string) => {
    const a = ip.split(".").map(Number);
    return (
      isIP(ip) === 4 &&
      ![0, 10, 127].includes(a[0]) &&
      !(a[0] === 169 && a[1] === 254) &&
      !(a[0] === 172 && a[1] >= 16 && a[1] <= 31) &&
      !(a[0] === 192 && [0, 168].includes(a[1])) &&
      !(a[0] === 100 && a[1] >= 64 && a[1] <= 127) &&
      a[0] < 224
    );
  };
  if (!records.length || records.some((r) => !publicV4(r.address)))
    throw Error("Private or non-public guard destination rejected");
  const address = records[0].address;
  return new Promise<unknown>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        lookup: ((_host: any, _opts: any, cb: any) =>
          cb(null, address, 4)) as any,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (response) => {
        let text = "";
        if (response.statusCode !== 200) {
          response.resume();
          reject(Error(`Guard HTTP ${response.statusCode}`));
          return;
        }
        response.on("data", (chunk) => {
          text += chunk;
          if (text.length > 65536)
            request.destroy(Error("Guard response too large"));
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(Error("Invalid JSON"));
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(Error("Guard timeout")),
      5000,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}
