import type { Metadata } from "next";
import { LiteConsole } from "@/components/modules/memoire/LiteConsole";
import { LiteModeBoot } from "@/components/modules/memoire/LiteModeBoot";

export const metadata: Metadata = { title: "Co-founder — bas débit" };

/** Version ultra-légère et vocale du co-fondateur (aucune image, mise en cache par la PWA). */
export default function BasDebitPage() {
  return (
    <main className="lite-page" style={{ maxWidth: 640, margin: "0 auto", padding: "12px 14px 40px" }}>
      <LiteModeBoot />
      <p style={{ display: "flex", justifyContent: "space-between", margin: "0 0 8px" }}>
        <strong>Co-founder · bas débit</strong>
        <a href="/workspace">Workspace complet</a>
      </p>
      <LiteConsole />
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 24 }}>Réponses abrégées, fondées sur le corpus officiel ou marquées « non couvert ». Connexion : <a href="/connexion?next=/workspace/memoire/bas-debit">sans mot de passe</a>.</p>
    </main>
  );
}
