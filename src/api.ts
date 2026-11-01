import { workspaceSession, currentWorkspace } from "./workspace-api";
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  await workspaceSession(currentWorkspace());
  let r: Response;
  try {
    r = await fetch(
      "/api" + path,
      body === undefined
        ? undefined
        : {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new Error(
      "Cannot reach the API. Check your connection and try again.",
    );
  }
  const text = await r.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`API returned an unexpected response (HTTP ${r.status}).`);
  }
  if (!r.ok) {
    const details = Array.isArray(data.details)
      ? data.details
          .map((d: any) => `${d.path?.join(".") || "Request"}: ${d.message}`)
          .join("; ")
      : "";
    throw new Error(
      `${data.code ? data.code + ": " : ""}${data.error || `Request failed (HTTP ${r.status})`}${details ? `: ${details}` : ""}`,
    );
  }
  return data;
}
