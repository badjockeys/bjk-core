import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";

import { Toaster } from "@/components/toast";
import { getConfig } from "@/lib/config";

import "./globals.css";

// Self-hosted by next/font: downloaded at build time and served from this site, so no request goes to Google.
const poppins = Poppins({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: getConfig().appUrl,
    title: { default: "Bad Jockeys", template: "%s · Bad Jockeys" },
    description:
      "Dashcam clips and photos of bad driving and terrible parking from around the UK. Faces and number plates blurred.",
    applicationName: "Bad Jockeys",
    openGraph: { siteName: "Bad Jockeys", locale: "en_GB", type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={poppins.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
