let established = "";
let establishing: Promise<void> | undefined;
export async function workspaceSession(
  workspace: "blue" | "red",
  force = false,
) {
  if (!force && established === workspace) return;
  if (establishing) await establishing;
  if (!force && established === workspace) return;
  establishing = (async () => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace }),
    });
    const d = await response.json();
    if (!response.ok)
      throw new Error(
        `${d.code || "AUTHENTICATION_ERROR"}: ${d.error || "Cannot open workspace"}`,
      );
    established = workspace;
  })();
  try {
    await establishing;
  } finally {
    establishing = undefined;
  }
}
export function currentWorkspace() {
  return location.pathname.startsWith("/red-team") ? "red" : "blue";
}
