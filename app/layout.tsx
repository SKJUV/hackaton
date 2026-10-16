import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Droit Cameroun — Comprendre vos droits",
  description:
    "Un assistant qui vous aide à comprendre les textes camerounais et à trouver les sources officielles.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
