import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['mapbox-gl'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
