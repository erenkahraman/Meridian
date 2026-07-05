import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import { HeaderActions } from "./components/HeaderActions";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meridian — OECD AI Visibility",
  description:
    "Measuring how visible the OECD is inside AI-generated answers, compared to peer institutions, across real policy questions.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon-32.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <header className="site-header">
          <div className="shell">
            <Link href="/" className="brand" aria-label="Meridian — home">
              <span className="brand-logo-box">
                <Image
                  src="/meridian.png"
                  alt="Meridian"
                  width={288}
                  height={96}
                  priority
                  className="brand-logo"
                />
              </span>
              <span className="brand-tag">OECD AI Visibility Monitor</span>
            </Link>
            <HeaderActions />
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="shell">
            <span>Meridian — OECD AI Visibility Monitor</span>
            <span>Model: Google Gemini · Storage: Supabase</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
