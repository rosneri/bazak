import type { NextConfig } from "next";
import { browserSecurityHeaders } from "../shared/browser-security";

const config: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/(.*)", headers: browserSecurityHeaders }];
  },
};

export default config;
