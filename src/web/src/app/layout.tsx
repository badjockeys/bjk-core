import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";

import { Toaster } from "@/components/toast";

import "./globals.css";

// Self-hosted by next/font: downloaded at build time and served from this site, so no request goes to Google.
const poppins = Poppins({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
});

// Every page depends on who's signed in, so nothing is rendered at build time (when settings aren't available).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
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

/** `modal` is the pop-up slot (app/@modal): the new post composer opens there over the current page. */
export default function RootLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={poppins.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        {modal}
        <Toaster />
      </body>
    </html>
  );
}
