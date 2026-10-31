const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface ApiFetchOptions extends RequestInit {
  token?: string | null;
}

export async function apiFetch<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers,
    ...rest,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: { code: 'NETWORK_ERROR', message: `HTTP ${response.status} ${response.statusText}` },
    }));
    throw errorBody.error || errorBody;
  }

  return response.json();
}
