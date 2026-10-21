import type { MetadataRoute } from "next";

/**
 * The web app manifest: lets people add Bad Jockeys to their Home Screen, where it opens full screen like an app.
 * iPhones and iPads only allow push notifications for sites opened from the Home Screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bad Jockeys",
    short_name: "Bad Jockeys",
    description: "Dashcam clips and photos of bad driving and terrible parking from around the UK.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
