import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  webpack(config, { isServer, nextRuntime }) {
    if (nextRuntime === 'edge') {
      // Edge runtime has no Node.js built-ins.
      // Alias the Node.js-only onboarding service to a no-op stub.
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(__dirname, 'lib/hotbox/onboarding-service')]:
          path.resolve(__dirname, 'lib/hotbox/onboarding-service.stub'),
      };
    }

    if (!isServer) {
      // Client bundle: stub out all Node.js built-ins.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        net: false,
        tls: false,
        dns: false,
      };
    }

    return config;
  },
};

export default nextConfig;
