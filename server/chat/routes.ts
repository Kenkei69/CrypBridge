import { selectProduct, selectMethod } from "./shopping";
import { Router } from "express";
import { z } from "zod";
import { requireSession, role } from "../security";
import {
  createConversation,
  getConversation,
  listConversations,
  sendMessage,
  chatAction,
} from "./service";
export const chatRouter = Router();
chatRouter.use("/conversations", requireSession);
chatRouter.get("/conversations", async (_req, res) =>
  res.json(
    await listConversations(
      res.locals.session.userId,
      res.locals.session.sandboxId,
    ),
  ),
);
chatRouter.post("/conversations", role("blue"), async (req, res) => {
  z.object({}).strict().parse(req.body);
  res
    .status(201)
    .json(
      await createConversation(
        res.locals.session.userId,
        res.locals.session.sandboxId,
      ),
    );
});
chatRouter.use("/conversations/:id", async (req, res, next) => {
  try {
    const c = await getConversation(
      String(req.params.id),
      res.locals.session.userId,
    );
    if (c.sandboxId !== res.locals.session.sandboxId)
      return res
        .status(404)
        .json({
          code: "CONVERSATION_NOT_FOUND",
          error: "Conversation not found in this test session.",
        });
    next();
  } catch (e) {
    next(e);
  }
});
chatRouter.get("/conversations/:id", async (req, res) =>
  res.json(
    await getConversation(String(req.params.id), res.locals.session.userId),
  ),
);
chatRouter.post(
  "/conversations/:id/messages",
  role("blue"),
  async (req, res) => {
    const b = z
      .object({
        text: z.string().trim().min(1).max(1000),
        clientKey: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    res.json(
      await sendMessage(
        String(req.params.id),
        res.locals.session.userId,
        b.text,
        b.clientKey,
        res.locals.session.sandboxId,
      ),
    );
  },
);
chatRouter.post(
  "/conversations/:id/purchases/:simulationId/:action",
  role("blue"),
  async (req, res) => {
    const { clientKey } = z
      .object({ clientKey: z.string().uuid() })
      .strict()
      .parse(req.body);
    const action = z
      .enum(["approve", "cancel", "continue"])
      .parse(req.params.action);
    res
      .status(action === "approve" ? 202 : 200)
      .json(
        await chatAction(
          String(req.params.id),
          res.locals.session.userId,
          String(req.params.simulationId),
          action,
          clientKey,
        ),
      );
  },
);

chatRouter.post(
  "/conversations/:id/products/:resourceId/select",
  role("blue"),
  async (req, res) => {
    const b = z
      .object({ discoveryId: z.string().uuid(), clientKey: z.string().uuid() })
      .strict()
      .parse(req.body);
    await selectProduct(
      String(req.params.id),
      res.locals.session.userId,
      res.locals.session.sandboxId,
      String(req.params.resourceId),
      b.discoveryId,
      b.clientKey,
    );
    res.json(
      await getConversation(String(req.params.id), res.locals.session.userId),
    );
  },
);
chatRouter.post(
  "/conversations/:id/selections/:selectionId/method",
  role("blue"),
  async (req, res) => {
    const b = z.object({ methodId: z.string() }).strict().parse(req.body);
    await selectMethod(
      String(req.params.id),
      res.locals.session.userId,
      res.locals.session.sandboxId,
      String(req.params.selectionId),
      b.methodId,
    );
    res.json(
      await getConversation(String(req.params.id), res.locals.session.userId),
    );
  },
);
