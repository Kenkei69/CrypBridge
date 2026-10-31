const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function authRequest(path: string, body: unknown) {
  if (!url || !key) throw new Error('Authentication is not configured. Contact the demo administrator.');
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'Authentication failed');
  return data;
}
export async function sendCode(email: string): Promise<void> {
  await authRequest('otp', { email, create_user: false });
}
export async function verifyCode(email: string, code: string): Promise<string> {
  const session = await authRequest('verify', { email, token: code, type: 'email' });
  localStorage.setItem('x402_refresh_token', session.refresh_token);
  return session.access_token;
}
export async function refreshSession(): Promise<string | null> {
  const refresh = localStorage.getItem('x402_refresh_token');
  if (!refresh) return null;
  const session = await authRequest('token?grant_type=refresh_token', { refresh_token: refresh });
  if (localStorage.getItem('x402_refresh_token') !== refresh) return null;
  localStorage.setItem('x402_refresh_token', session.refresh_token);
  return session.access_token;
}
