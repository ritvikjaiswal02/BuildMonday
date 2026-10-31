/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // GET /api/extension/download zips the extension folder at request time,
    // so the folder must ship with that function on Vercel.
    outputFileTracingIncludes: {
      "/api/extension/download": ["./extension/**/*"],
    },
  },
};

export default nextConfig;
