import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rumah Kita", template: "%s | Rumah Kita" },
  description: "Ruang pribadi untuk mengelola kebutuhan dan keseharian rumah.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
