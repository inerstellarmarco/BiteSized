import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { getSessionProfile } from "@/lib/auth/current";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const source = Source_Sans_3({ subsets: ["latin"], variable: "--font-source", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: { default: "Bite Sized", template: "%s · Bite Sized" },
  description: "Short lessons, one idea at a time. Any subject, one card at a time.",
  applicationName: "Bite Sized",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Bite Sized", statusBarStyle: "default" },
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3ecdf" },
    { media: "(prefers-color-scheme: dark)", color: "#12110f" },
  ],
};

const themeBoot = `(function(){try{var el=document.documentElement;var t=el.dataset.theme||"system";var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);el.classList.toggle("dark",dark);}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let cookieTheme: string | undefined;
  let cookieFont: string | undefined;
  try {
    const store = await cookies();
    cookieTheme = store.get("bs_theme")?.value;
    cookieFont = store.get("bs_font")?.value;
  } catch {
    // Ignore cookie read errors outside request context
  }
  const profile = await getSessionProfile().catch(() => null);
  const theme = profile?.theme ?? cookieTheme ?? "system";
  const font = profile?.fontSize ?? cookieFont ?? "md";
  return (
    <html
      lang="en"
      data-theme={theme}
      data-font={font}
      className={`${source.variable} ${fraunces.variable} ${theme === "dark" ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
