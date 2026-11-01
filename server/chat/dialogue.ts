import { z } from "zod";
import { postPublicJson } from "../outbound";
const hintSchema = z
  .object({
    intent: z.enum([
      "purchase",
      "catalog",
      "balance",
      "explain",
      "greeting",
      "unknown",
    ]),
    resourceId: z.string().max(80).optional(),
    budget: z
      .string()
      .regex(/^\d+(\.\d{1,6})?$/)
      .optional(),
  })
  .strict();
// An optional model adapter can interpret user dialogue, never issue approvals or payment fields.
export async function interpretDialogue(
  text: string,
  catalog: { id: string; name: string; price: string }[],
  history: string[],
) {
  if (!process.env.DIALOGUE_ADAPTER_URL) return null;
  const hint = hintSchema.parse(
    await postPublicJson(
      process.env.DIALOGUE_ADAPTER_URL,
      {
        task: "interpret_user_intent_only",
        instruction:
          "Choose a catalog resource and explicit user budget. Return only the documented JSON intent. You cannot approve payments, change recipients or authorize signing.",
        text,
        history: history.slice(-6),
        catalog,
      },
      (process.env.DIALOGUE_ALLOWED_ORIGINS || "").split(","),
      process.env.DIALOGUE_API_TOKEN,
    ),
  );
  if (hint.resourceId && !catalog.some((r) => r.id === hint.resourceId))
    throw Error("Dialogue provider returned an unknown catalog resource");
  return hint;
}
