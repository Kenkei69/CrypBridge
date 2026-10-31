/** @type {import('next').NextConfig} */
if (process.env.NODE_ENV === 'production') {
  for (const name of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    if (!process.env[name]) throw new Error(`Missing build environment variable: ${name}`);
  }
  for (const name of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
    if (!process.env[name].startsWith('https://')) throw new Error(`${name} must use HTTPS`);
  }
}
const nextConfig = {
  experimental: { cpus: 2 },
  reactStrictMode: true,
  transpilePackages: ['@x402/shared'],
};

export default nextConfig;
