"use client";

import { useEffect, useState } from "react";
import { api, Badge, Card } from "@/components/workspace/ui";
import type { studioStatus } from "@/lib/studio/registry";

type Status = ReturnType<typeof studioStatus>;

export function StudioTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Status>("/api/studio").then(setStatus).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <Card title="Studio co-fondateur"><p>{error}</p></Card>;
  if (!status) return <Card title="Studio co-fondateur"><p>Chargement…</p></Card>;
  if (status.state === "en_attente")
    return (
      <Card title="Studio co-fondateur" actions={<Badge tone="amber">Intégration en attente</Badge>}>
        <p>
          Cet espace accueillera les modules d&apos;<a href={status.source.repo} target="_blank" rel="noreferrer">ai-cofounder-studio</a>{" "}
          (branche <code>{status.source.expectedBranch}</code>). Leur code est en cours de publication par l&apos;auteur ;
          ils seront intégrés ici, réservés à l&apos;offre Co-fondateur, avec leur provenance.
        </p>
      </Card>
    );
  return (
    <div className="ws-grid">
      {status.modules.map((m) => (
        <Card key={m.id} title={m.title}>
          <p>{m.description}</p>
          <p className="ws-muted">
            Provenance : {m.provenance.repo} · {m.provenance.branch} · {m.provenance.commit.slice(0, 7)} · licence {m.provenance.license ?? "non précisée"}
          </p>
        </Card>
      ))}
    </div>
  );
}
