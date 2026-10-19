import type { MetadataRoute } from "next";

import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/post/new", "/profile/", "/auth/", "/api/"],
    },
    host: getConfig().appUrl.origin,
  };
}
