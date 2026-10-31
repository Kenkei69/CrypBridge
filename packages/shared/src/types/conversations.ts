export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageMetadata {
  intentId?: string;
  suggestedProductId?: string;
  requiresConfirmation?: boolean;
  securityNotice?: string;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}
