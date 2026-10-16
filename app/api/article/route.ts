import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type EgovaArticle = {
  document_id: string;
  document_titre_court: string;
  type_acte: string;
  numero_officiel: string;
  article_numero: string;
  article_entete: string;
  contenu_extrait: string;
  mots_cles: string[];
};

type EgovaDocument = {
  id: string;
  fichier: {
    nom_fichier: string;
    chemin_relatif: string;
    nombre_pages: number;
  };
  identification: {
    type_acte: string;
    numero_officiel: string;
    titre_officiel: string;
    titre_court: string;
    date_signature_texte: string;
    annee: number;
    autorite_signataire: string;
    institution_emettrice: string;
    statut_juridique: string;
  };
  analyse_juridique: {
    objet_general: string;
    resume_analytique: string;
    domaines_cles: string[];
    acteurs_concernes: string[];
    mots_cles: string[];
  };
  dispositions_conformite?: {
    obligations_principales?: string[];
    sanctions_et_penalites?: string[];
    redevances_et_tarifs?: string[];
  };
};

let cachedDb: { documents: EgovaDocument[] } | null = null;
let cachedArticles: EgovaArticle[] | null = null;

async function loadEgovaData() {
  if (!cachedDb) {
    const dbRaw = await readFile(
      path.join(process.cwd(), "data", "base_de_donnees_reglementation.json"),
      "utf8",
    );
    cachedDb = JSON.parse(dbRaw);
  }
  if (!cachedArticles) {
    const artRaw = await readFile(
      path.join(process.cwd(), "data", "reglementation_articles_index.json"),
      "utf8",
    );
    cachedArticles = JSON.parse(artRaw);
  }
  return { db: cachedDb!, articles: cachedArticles! };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const docId = url.searchParams.get("docId");
  const file = url.searchParams.get("file");
  const query = url.searchParams.get("query");

  try {
    const { db, articles } = await loadEgovaData();

    // 1. Search by docId or file
    let targetDoc: EgovaDocument | undefined;
    if (docId) {
      targetDoc = db.documents.find((d) => d.id.toLowerCase() === docId.toLowerCase());
    } else if (file) {
      const fileName = path.basename(file).toLowerCase();
      targetDoc = db.documents.find(
        (d) =>
          d.fichier.nom_fichier.toLowerCase() === fileName ||
          d.fichier.chemin_relatif.toLowerCase().includes(fileName),
      );
    }

    if (targetDoc) {
      // Find matching articles for this document
      const docArticles = articles.filter((a) => a.document_id === targetDoc!.id);

      return NextResponse.json({
        found: true,
        document: {
          id: targetDoc.id,
          title: targetDoc.identification.titre_officiel || targetDoc.identification.titre_court,
          shortTitle: targetDoc.identification.titre_court,
          type: targetDoc.identification.type_acte,
          number: targetDoc.identification.numero_officiel,
          date: targetDoc.identification.date_signature_texte,
          authority: targetDoc.identification.autorite_signataire,
          status: targetDoc.identification.statut_juridique,
          summary: targetDoc.analyse_juridique.resume_analytique || targetDoc.analyse_juridique.objet_general,
          domaines: targetDoc.analyse_juridique.domaines_cles,
          sanctions: targetDoc.dispositions_conformite?.sanctions_et_penalites ?? [],
          obligations: targetDoc.dispositions_conformite?.obligations_principales ?? [],
          pdfFile: targetDoc.fichier.chemin_relatif,
          pages: targetDoc.fichier.nombre_pages,
        },
        articles: docArticles.slice(0, 10).map((a) => ({
          numero: a.article_numero,
          entete: a.article_entete,
          extrait: a.contenu_extrait,
        })),
      });
    }

    // 2. Search articles by query keyword
    if (query) {
      const q = query.toLowerCase();
      const matchingArticles = articles
        .filter(
          (a) =>
            a.contenu_extrait.toLowerCase().includes(q) ||
            a.document_titre_court.toLowerCase().includes(q) ||
            a.mots_cles.some((m) => m.toLowerCase().includes(q)),
        )
        .slice(0, 5);

      return NextResponse.json({
        found: matchingArticles.length > 0,
        query,
        articles: matchingArticles,
      });
    }

    return NextResponse.json({ error: "Veuillez fournir un paramètre 'docId', 'file' ou 'query'." }, { status: 400 });
  } catch (error) {
    console.error("Error fetching article data:", error);
    return NextResponse.json({ error: "Impossible de charger les données de l'article." }, { status: 500 });
  }
}
