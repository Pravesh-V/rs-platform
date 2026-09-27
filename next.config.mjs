/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/clients/*/reports/*/pdf": ["./public/fonts/NotoSans-Regular.ttf"],
  },
};

export default nextConfig;
