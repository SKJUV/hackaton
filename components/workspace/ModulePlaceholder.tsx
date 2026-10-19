import type { NavEntry } from "./module-catalog";
import { Badge, Card } from "./ui";

/** Emplacement réservé : affiché tant que l'équipe du module n'a pas livré son composant. */
export function ModulePlaceholder({ entry }: { entry: NavEntry }) {
  return (
    <Card title={entry.label} actions={<Badge tone="amber">En construction</Badge>}>
      <p>{entry.description ?? "Module à venir."}</p>
      {entry.demoOnly && <p className="ws-muted">Ce module fonctionnera avec des données fictives (démo).</p>}
      <p className="ws-muted">Équipe : {entry.team ?? "—"}. L&apos;agent co-fondateur pourra piloter ce module dès son intégration.</p>
    </Card>
  );
}
