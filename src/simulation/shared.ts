export const EPOCH = 1767225600000;
export const virtualTime = (ms: number) => new Date(EPOCH + ms).toISOString();
export const outcome = (state: string) =>
  ({
    COMPLETED: "Payment Successful",
    BLOCKED: "Payment Blocked",
    FAILED: "Payment Failed",
    PENDING: "Verification Required",
    REVIEW: "Verification Required",
    CANCELED: "Payment Rejected",
    AWAITING_APPROVAL: "Review payment",
    AUTHORIZED: "Processing",
  })[state] || state;
export async function downloadReport(path: string, filename: string) {
  const r = await fetch(path);
  if (!r.ok) {
    const e = await r.json();
    throw new Error(e.error || "Evidence export failed");
  }
  const blob = await r.blob(),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
