import { browserSecurityHeaders } from "@bazak/shared/browser-security";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/(.*)", headers: browserSecurityHeaders }];
  },
};

export default config;
