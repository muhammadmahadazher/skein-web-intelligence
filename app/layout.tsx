import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./enhancements.css";
import "./auth.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

function safeOrigin(incoming: Headers) {
  const forwardedHost = incoming.get("x-forwarded-host")?.split(",")[0]?.trim();
  const directHost = incoming.get("host")?.trim();
  const candidate = forwardedHost || directHost || "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(candidate) ? candidate : "localhost:3000";
  const forwardedProto = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : host.startsWith("localhost") || host.startsWith("127.")
        ? "http"
        : "https";
  return new URL(`${protocol}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = safeOrigin(await headers());
  const image = new URL("/og-skein.jpg", origin);
  return {
    metadataBase: origin,
    title: "Skein — Scan public websites into dependable data",
    description:
      "A real, observable website crawler with progress, ETA, evidence results, and strict safety boundaries.",
    applicationName: "Skein",
    openGraph: {
      title: "Skein — Web intelligence, without blind spots",
      description:
        "Scan public websites with visible progress, bounded safety, and evidence-ready results.",
      type: "website",
      url: origin,
      images: [{ url: image, width: 1200, height: 630, alt: "Skein web intelligence" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Skein — Web intelligence, without blind spots",
      description:
        "Scan public websites with visible progress, bounded safety, and evidence-ready results.",
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
