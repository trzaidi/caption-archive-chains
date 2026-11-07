import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
};

export default config;
