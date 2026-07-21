/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Scraping/extraction routes rely on the Node.js runtime (cheerio, Buffer, undici).
  serverExternalPackages: ["cheerio", "undici"],
};

export default nextConfig;
