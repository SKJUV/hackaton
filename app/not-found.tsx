import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        textAlign: "center",
        background: "var(--bg-primary, #0a0e17)",
        color: "var(--text-primary, #f8fafc)",
        fontFamily: "var(--font-sans, sans-serif)",
      }}
    >
      <h1 style={{ fontSize: "3rem", margin: "0 0 12px", fontWeight: "800" }}>404</h1>
      <p
        style={{
          fontSize: "1.1rem",
          margin: "0 0 24px",
          color: "var(--text-secondary, #94a3b8)",
        }}
      >
        Page non trouvée
      </p>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 20px",
          borderRadius: "9999px",
          background: "var(--accent, #38bdf8)",
          color: "#ffffff",
          textDecoration: "none",
          fontWeight: "600",
        }}
      >
        <ArrowLeft size={16} />
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
