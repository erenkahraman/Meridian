import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meridian — OECD AI Visibility",
  description:
    "Measuring how visible the OECD is inside AI-generated answers, compared to peer institutions, across real policy questions.",
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
            <Link href="/" className="wordmark">
              Meridian
              <span>OECD AI Visibility Monitor</span>
            </Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/">Overview</Link>
              <Link href="/geo">GEO Audit</Link>
              <Link href="/live">Live Query</Link>
            </nav>
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
