#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Outil CLI de recherche et d'exploitation de la base de données réglementaire.
Permet d'interroger rapidement les 43 textes juridiques et 836 articles.
Usage:
    python3 recherche_reglementation.py --help
    python3 recherche_reglementation.py --query "cybersécurité"
    python3 recherche_reglementation.py --theme "itinerance_nationale"
    python3 recherche_reglementation.py --type "Loi"
    python3 recherche_reglementation.py --article "Article 1" --query "interconnexion"
    python3 recherche_reglementation.py --stats
"""

import sys
import json
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_FILE = BASE_DIR / 'base_de_donnees_reglementation.json'
ARTICLES_FILE = BASE_DIR / 'reglementation_articles_index.json'

def load_db():
    if not DB_FILE.exists():
        print(f"Erreur: Fichier {DB_FILE} introuvable.")
        sys.exit(1)
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_articles():
    if not ARTICLES_FILE.exists():
        return []
    with open(ARTICLES_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def display_doc(doc, detailed=False):
    ident = doc['identification']
    fich = doc['fichier']
    ana = doc['analyse_juridique']
    
    print("\n" + "="*80)
    print(f"[{doc['id']}] {ident['titre_officiel']}")
    print("="*80)
    print(f"• Numéro officiel   : {ident['numero_officiel']}")
    print(f"• Type d'acte       : {ident['type_acte']}")
    print(f"• Date & Année      : {ident['date_signature_texte']} ({ident['annee']})")
    print(f"• Autorité          : {ident['autorite_signataire']} ({ident['institution_emettrice']})")
    print(f"• Statut juridique  : {ident['statut_juridique']}")
    print(f"• Fichier source    : {fich['chemin_relatif']} ({fich['taille_lisible']}, {fich['nombre_pages']} pages)")
    print(f"• Mots-clés         : {', '.join(ana['mots_cles'])}")
    print(f"\n[OBJET]")
    print(f"{ana['objet_general']}")
    print(f"\n[RÉSUMÉ ANALYTIQUE]")
    print(f"{ana['resume_analytique']}")
    
    if detailed:
        print(f"\n[DIVISIONS & STRUCTURE]")
        for d in doc['structure_document']['divisions_principales']:
            print(f"  - {d['type']}: {d['intitule']}")
            
        print(f"\n[ARTICLES DISPONIBLES ({len(doc['articles_extraits'])})]")
        for a in doc['articles_extraits'][:10]:
            print(f"  * {a['numero']} : {a['extrait_disposition'][:120]}...")
        if len(doc['articles_extraits']) > 10:
            print(f"  ... et {len(doc['articles_extraits']) - 10} autres articles.")
            
        conf = doc['dispositions_conformite']
        if conf['obligations_principales'] or conf['sanctions_et_penalites']:
            print(f"\n[CONFORMITÉ & SANCTIONS]")
            for o in conf['obligations_principales']:
                print(f"  - Obligation : {o}")
            for s in conf['sanctions_et_penalites']:
                print(f"  - Sanction   : {s}")

def main():
    parser = argparse.ArgumentParser(description="Interrogez la base de données réglementaire des télécoms et du numérique.")
    parser.add_argument('-q', '--query', type=str, help="Recherche plein texte dans les titres, résumés et mots-clés")
    parser.add_argument('-t', '--theme', type=str, help="Filtrer par clé thématique (ex: cybersecurite_et_cybercriminalite, itinerance_nationale, etc.)")
    parser.add_argument('--type', type=str, help="Filtrer par type d'acte (Loi, Décret, Arrêté, Décision, Directive, Recueil)")
    parser.add_argument('-a', '--article', type=str, help="Rechercher un numéro d'article spécifique (ex: 'Article 5')")
    parser.add_argument('--detailed', action='store_true', help="Afficher tous les détails et articles de chaque texte")
    parser.add_argument('--stats', action='store_true', help="Afficher les statistiques du corpus juridique")
    parser.add_argument('--themes-list', action='store_true', help="Lister tous les thèmes disponibles")
    
    args = parser.parse_args()
    db = load_db()
    
    if args.stats:
        stats = db['statistiques_globales']
        print("\n=== STATISTIQUES GLOBALES DU CORPUS RÉGLEMENTAIRE ===")
        print(f"Total fichiers analysés : {stats['nombre_total_fichiers_analyses']}")
        print(f"Total pages de textes   : {stats['total_pages_corpus']}")
        print(f"Total mots extraits     : {stats['total_mots_extraits']}")
        print("\nRépartition par type d'acte :")
        for k, v in stats['repartition_par_type_acte'].items():
            print(f"  • {k.replace('_', ' '):35} : {v}")
        print("\nRépartition par sous-dossier :")
        for k, v in stats['repartition_par_categorie'].items():
            print(f"  • {k:25} : {v}")
        print(f"\nDoublons détectés       : {stats['nombre_doublons_detectes']}")
        print(f"Période couverte        : {stats['periode_chronologique']['acte_le_plus_ancien']} à {stats['periode_chronologique']['acte_le_plus_recent']}")
        return

    if args.themes_list:
        print("\n=== INDEX DES THÈMES DISPONIBLES ===")
        for key, val in db['thesaurus_et_index_thematique'].items():
            print(f"\n• Clé : {key}")
            print(f"  Titre : {val['libelle']}")
            print(f"  Documents associés : {', '.join(val['documents_associes'])}")
            print(f"  Concepts clés : {', '.join(val['concepts_cles'])}")
        return

    # Recherche dans les articles si -a demandé
    if args.article:
        articles = load_articles()
        found_articles = []
        art_pat = args.article.strip().lower()
        q_pat = (args.query.strip().lower()) if args.query else ""
        
        for a in articles:
            if art_pat in a['article_numero'].lower():
                if not q_pat or q_pat in a['contenu_extrait'].lower() or q_pat in a['document_titre_court'].lower():
                    found_articles.append(a)
                    
        print(f"\n=== RÉSULTATS RECHERCHE ARTICLES ({len(found_articles)}) ===")
        for fa in found_articles[:20]:
            print(f"\n[{fa['document_id']}] {fa['document_titre_court']} - {fa['article_numero']}")
            print(f"Entête : {fa['article_entete']}")
            print(f"Contenu : {fa['contenu_extrait']}")
        if len(found_articles) > 20:
            print(f"\n... et {len(found_articles) - 20} autres articles.")
        return

    # Filtrage des documents
    docs = db['documents']
    filtered = []
    
    # Filtre par thème
    if args.theme:
        theme_key = args.theme.lower()
        thesaurus = db['thesaurus_et_index_thematique']
        if theme_key in thesaurus:
            valid_ids = set(thesaurus[theme_key]['documents_associes'])
            docs = [d for d in docs if d['id'] in valid_ids]
        else:
            print(f"Thème '{args.theme}' non trouvé. Utilisez --themes-list pour voir les thèmes disponibles.")
            return

    # Filtre par type
    if args.type:
        t_pat = args.type.lower()
        docs = [d for d in docs if t_pat in d['identification']['type_acte'].lower()]

    # Filtre par requête textuelle
    if args.query:
        q = args.query.lower()
        for d in docs:
            searchable = " ".join([
                d['identification']['titre_officiel'],
                d['identification']['numero_officiel'],
                d['analyse_juridique']['objet_general'],
                d['analyse_juridique']['resume_analytique'],
                " ".join(d['analyse_juridique']['mots_cles'])
            ]).lower()
            if q in searchable:
                filtered.append(d)
    else:
        filtered = docs

    print(f"\nNombre de documents trouvés : {len(filtered)}")
    for d in filtered:
        display_doc(d, detailed=args.detailed)

if __name__ == '__main__':
    main()
