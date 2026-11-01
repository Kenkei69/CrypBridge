import type { Simulation } from "./simulation-model";
export interface ChatMessage {
  id: string;
  sequence: number;
  conversationId: string;
  simulationId: string | null;
  eventId: string | null;
  type: string;
  role: "user" | "assistant" | "guardian" | "system";
  content: string;
  data: any;
  createdAt: string;
}
export interface Conversation {
  dialogueMode?: string;
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  simulations: Simulation[];
}
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}
