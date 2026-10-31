export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'authenticated' | 'admin';
  displayName?: string | null;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface SessionData {
  user: AuthenticatedUser;
  token: string;
  expiresAt: number;
}
