# Base de Données Réglementaire et Juridique des Télécommunications, TIC et Économie Numérique

Cette base de données compile, structure et enrichit l'intégralité des **43 documents** réglementaires et juridiques (hors archive `reglementation.zip`, expressément exclue) présents dans le dossier `reglementation/`.

Elle a été générée après extraction textuelle double passe (flux numériques directs et OCR multithreadé Tesseract français/anglais pour les actes scannés), analyse juridique approfondie, découpage structurel et indexation article par article.

---

## 1. Fichiers Disponibles

| Fichier | Taille | Description & Cas d'Usage |
| :--- | :--- | :--- |
| **[`base_de_donnees_reglementation.json`](file:///home/skjuve/Documents/egova/base_de_donnees_reglementation.json)** | ~500 Ko | **Base de données principale complète** : métadonnées, 43 documents avec analyses et articles, textes juridiques unifiés, thésaurus thématique et glossaire légal. |
| **[`reglementation_documents.json`](file:///home/skjuve/Documents/egova/reglementation_documents.json)** | ~460 Ko | **Table des 43 documents** prête pour l'ingestion dans MongoDB, PostgreSQL (`jsonb`), Elasticsearch ou OpenSearch. |
| **[`reglementation_articles_index.json`](file:///home/skjuve/Documents/egova/reglementation_articles_index.json)** | ~590 Ko | **Index granulaire des 836 articles** découpés individuellement, optimisé pour les pipelines RAG (Retrieval-Augmented Generation), la recherche sémantique et les embeddings vectoriels. |
| **[`reglementation_thesaurus.json`](file:///home/skjuve/Documents/egova/reglementation_thesaurus.json)** | ~4 Ko | **Index thématique inversé** reliant les 10 grands domaines réglementaires aux identifiants de documents et mots-clés. |
| **[`recherche_reglementation.py`](file:///home/skjuve/Documents/egova/recherche_reglementation.py)** | CLI Python | **Outil de requête interactif** en ligne de commande pour chercher par mot-clé, article, thème, autorité ou afficher les statistiques. |

---

## 2. Statistiques Globales du Corpus

- **Nombre total de documents analysés** : 43
- **Total des pages traitées** : 1 998 pages
- **Total des mots extraits et analysés** : 453 915 mots
- **Nombre total d'articles juridiques indexés** : 836 articles
- **Période chronologique couverte** : du 14 juillet 1998 (Loi sur la concurrence) au 16 avril 2024 (Décisions de régulation ART) et édition consolidée 2023 du MINPOSTEL.
- **Répartition par catégorie d'actes** :
  - **Lois et Lois-cadres** : 10
  - **Décrets (Premier Ministre et Présidentiels)** : 10
  - **Arrêtés Ministériels et Interministériels** : 8
  - **Décisions Réglementaires de l'ART** : 8
  - **Directives Régionales (CEMAC) et Techniques** : 2
  - **Recueils Officiels et Annuaires Statistiques** : 5
- **Doublons identifiés et tracés** : 3 fichiers (doublons physiques ou versions pré-presse/scannées rigoureusement signalés par le champ `est_doublon` et `doublon_de`).

---

## 3. Schéma et Structure de Données (JSON)

Chaque document dans `documents` respecte la structure normalisée suivante :

```json
{
  "id": "DOC-LOI-007",
  "fichier": {
    "nom_fichier": "Loi_2010-013_communications_electroniques.pdf",
    "chemin_relatif": "reglementation/Lois/Loi_2010-013_communications_electroniques.pdf",
    "dossier_categorie": "Lois",
    "taille_octets": 427082,
    "taille_lisible": "417.1 Ko",
    "nombre_pages": 42,
    "md5": "356a2cf8d910a5626ebc0c80b64177d6",
    "sha256": "4b9e4a8...",
    "methode_numerisation": "Texte vectoriel numérique natif",
    "nombre_mots_extraits": 13341
  },
  "identification": {
    "type_acte": "Loi",
    "numero_officiel": "Loi N° 2010/013",
    "titre_officiel": "Loi N° 2010/013 du 21 décembre 2010 régissant les communications électroniques au Cameroun",
    "titre_court": "Loi sur les Communications Électroniques",
    "date_signature": "2010-12-21",
    "date_signature_texte": "21 décembre 2010",
    "annee": 2010,
    "autorite_signataire": "Président de la République",
    "institution_emettrice": "Assemblée Nationale / Présidence de la République",
    "juridiction": "République du Cameroun",
    "statut_juridique": "En vigueur (Modifiée par la Loi n° 2015/006 du 20 avril 2015)",
    "langue": "fr",
    "est_doublon": false,
    "doublon_de": null
  },
  "analyse_juridique": {
    "objet_general": "Cadre législatif suprême régissant l'ensemble des réseaux et services de communications électroniques.",
    "resume_analytique": "Loi fondamentale du secteur...",
    "domaines_cles": ["Communications électroniques", "Régimes juridiques", "Interconnexion", "Partage d'infrastructures", "Service universel"],
    "acteurs_concernes": ["MINPOSTEL", "ART", "Opérateurs concessionnaires", "FAI", "Consommateurs"],
    "textes_vises": ["Constitution de la République du Cameroun"],
    "mots_cles": ["communications électroniques", "concession", "licence", "interconnexion", "service universel", "ART"]
  },
  "structure_document": {
    "nombre_divisions": 21,
    "divisions_principales": [
      {"type": "Titre", "intitule": "TITRE I DISPOSITIONS GENERALES"},
      {"type": "Chapitre", "intitule": "CHAPITRE I DU CHAMP D'APPLICATION ET DES DEFINITIONS"}
    ],
    "nombre_articles_identifies": 40
  },
  "articles_extraits": [
    {
      "numero": "Article 1er",
      "entete": "Article 1er.-",
      "extrait_disposition": "La présente loi régit les communications électroniques au Cameroun..."
    }
  ],
  "dispositions_conformite": {
    "obligations_principales": ["Respect du cahier des charges d'exploitation..."],
    "sanctions_et_penalites": ["Pénalités pécuniaires pouvant atteindre 3% à 5% du chiffre d'affaires annuel..."],
    "redevances_et_tarifs": ["Contribution de 2% au titre du service universel..."]
  }
}
```

---

## 4. Guide d'Utilisation de l'Outil CLI (`recherche_reglementation.py`)

Un script d'interrogation rapide en Python est mis à disposition :

### 1. Statistiques générales
```bash
python3 recherche_reglementation.py --stats
```

### 2. Recherche par mot-clé (dans les titres, résumés, objets et mots-clés)
```bash
python3 recherche_reglementation.py -q "itinérance"
python3 recherche_reglementation.py -q "carte sim"
python3 recherche_reglementation.py -q "pylônes"
```

### 3. Recherche par grand domaine thématique
```bash
# Lister les 10 thèmes disponibles
python3 recherche_reglementation.py --themes-list

# Filtrer par thème
python3 recherche_reglementation.py -t "cybersecurite_et_cybercriminalite"
python3 recherche_reglementation.py -t "itinerance_nationale"
python3 recherche_reglementation.py -t "infrastructures_passives_et_pylones"
```

### 4. Recherche granulaire au niveau des articles
```bash
# Trouver toutes les occurrences de l'Article 5 traitant d'interconnexion ou de licences
python3 recherche_reglementation.py -a "Article 5" -q "interconnexion"
```

### 5. Filtrage par type d'acte avec détails complets
```bash
python3 recherche_reglementation.py --type "Décret" --detailed
```

---

## 5. Exemples d'Exploitation en Python

### Exemple 1 : Charger la base et rechercher tous les textes sur la cybersécurité
```python
import json

with open('base_de_donnees_reglementation.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

# Récupérer les textes du thème Cybersécurité
cyber_ids = db['thesaurus_et_index_thematique']['cybersecurite_et_cybercriminalite']['documents_associes']
cyber_docs = [d for d in db['documents'] if d['id'] in cyber_ids]

for doc in cyber_docs:
    print(f"[{doc['id']}] {doc['identification']['numero_officiel']} : {doc['identification']['titre_officiel']}")
```

### Exemple 2 : Pipeline RAG / Vectorisation à partir de `reglementation_articles_index.json`
```python
import json

with open('reglementation_articles_index.json', 'r', encoding='utf-8') as f:
    articles = json.load(f)

print(f"Total articles prêts pour vectorisation : {len(articles)}")

# Format adapté pour LangChain / LlamaIndex / ChromaDB :
documents_rag = [
    {
        "page_content": f"{a['article_entete']}\n{a['contenu_extrait']}",
        "metadata": {
            "source_doc_id": a['document_id'],
            "titre_texte": a['document_titre_court'],
            "numero_acte": a['numero_officiel'],
            "article": a['article_numero'],
            "keywords": a['mots_cles']
        }
    }
    for a in articles
]
```

---

## 6. Inventaire exhaustif des 43 Actes Référencés

### Arrêtés (8 documents)
- `DOC-ARR-001` : Arrêté N° 00000016/MINFI (Version ENG) - Classification par catégorie des établissements publics (ART en Catégorie 1).
- `DOC-ARR-002` : Arrêté N° 00000016/MINFI (Version FR) - Classification par catégorie des établissements publics.
- `DOC-ARR-003` : Arrêté N° 209/CAB/PM du 21 août 2008 - Comité de pilotage de la Stratégie Nationale de Développement des TIC.
- `DOC-ARR-004` : Arrêté N° 01170/CAB/PM du 25 novembre 2009 - Comité interministériel de supervision du projet « E-government ».
- `DOC-ARR-005` : Arrêté N° 00000013/MINPOSTEL du 27 juin 2012 - Modalités d’homologation des équipements terminaux et installations radio.
- `DOC-ARR-006` : Arrêté N° 00000014/MINPOSTEL du 27 juin 2012 - Qualification des certificats et signatures électroniques.
- `DOC-ARR-007` : Arrêté N° 00000015/MINPOSTEL du 27 juin 2012 - Modalités de dégroupage de la boucle locale.
- `DOC-ARR-008` : Arrêté N° 00080/MINEFI/MINPT du 20 février 2002 - Droits, frais, contributions et redevances perçus par l'ART.

### Décrets (10 documents)
- `DOC-DEC-001` : Décret N° 2015/3759/PM du 03 septembre 2015 - Identification des abonnés et terminaux des réseaux de communications électroniques.
- `DOC-DEC-002` : Décret N° 2013/0403/PM du 27 février 2013 - Seuils maxima d'exposition du public aux rayonnements électromagnétiques.
- `DOC-DEC-003` : Décret N° 2013/0400/PM du 27 février 2013 - Régime des moyens et prestations de cryptographie (homologation ANTIC).
- `DOC-DEC-004` : Décret N° 2013/0396/PM du 27 février 2013 - Exploitation et contrôle des fréquences radioélectriques.
- `DOC-DEC-005` : Décret N° 2012/1637/PM du 14 juin 2012 - Régime de la déclaration des réseaux et installations.
- `DOC-DEC-006` : Décret N° 2012/1638/PM du 14 juin 2012 - Régime de l'autorisation pour l'établissement et l'exploitation des réseaux.
- `DOC-DEC-007` : Décret N° 2012/1643/PM du 14 juin 2012 - Audit de sécurité obligatoire des réseaux et systèmes d'information.
- `DOC-DEC-008` : Décret N° 2012/1318/PM du 22 mai 2012 - Autorisation d'exercice de l'activité de certification électronique (PSCE).
- `DOC-DEC-009` : Décret N° 2012/203 du 20 avril 2012 - Organisation et fonctionnement de l'Agence de Régulation des Télécommunications (ART).
- `DOC-DEC-010` : Décret N° 2022/309 du 19 juillet 2022 - Nomination des membres du Conseil d'Administration de l'ART.

### Lois (10 documents)
- `DOC-LOI-001` : Loi-cadre N° 2011/012 du 06 mai 2011 - Protection du consommateur au Cameroun.
- `DOC-LOI-002` : Loi N° 2015/006 du 20 avril 2015 - Modifiant et complétant la loi n° 2010/013 régissant les communications électroniques.
- `DOC-LOI-003` : Loi N° 2015/006 du 20 avril 2015 - Copie officielle promulguée.
- `DOC-LOI-004` : Loi N° 2010/021 du 21 décembre 2010 - Régissant le commerce électronique au Cameroun.
- `DOC-LOI-005` : Loi N° 2010/012 du 21 décembre 2010 - Cybersécurité et cybercriminalité au Cameroun.
- `DOC-LOI-006` : Loi N° 2010/012 - Copie conforme identique.
- `DOC-LOI-007` : Loi N° 2010/013 du 21 décembre 2010 - Régissant les communications électroniques au Cameroun (Loi fondamentale).
- `DOC-LOI-008` : Loi N° 2010/013 - Copie avec coquille de nommage (2013-013).
- `DOC-LOI-009` : Loi N° 2001/010 du 23 juillet 2001 - Instituant le service minimum dans le secteur des télécommunications.
- `DOC-LOI-010` : Loi N° 98/013 du 14 juillet 1998 - Relative à la concurrence au Cameroun.

### Décisions de l'ART (8 documents)
- `DOC-DECIS-001` : Décision N° 00000030/ART/DG/DF/SDM/SMF du 22 février 2024 - Résultats consultation fournitures bureau ART.
- `DOC-DECIS-002` : Décision N° 00000048/ART/DG/... du 16 avril 2024 - Approbation catalogues d’offres Africa Mobile Networks (AMN) 2024 et exposé des motifs.
- `DOC-DECIS-003` : Décision N° 00000333/ART/DG/... du 11 mars 2024 - Lignes directrices relatives aux services d'itinérance nationale (National Roaming).
- `DOC-DECIS-004` : Décision N° 00000001/ART/DG/DLCI du 02 janvier 2018 - Prescrivant aux opérateurs les modalités de la messagerie vocale.
- `DOC-DECIS-005` : Décision N° 00000001/ART/DG/DLCI du 02 janvier 2018 - Copie scannée messagerie vocale.
- `DOC-DECIS-006` : Décision N° 00000049/ART/DG/... du 16 avril 2024 - Approbation catalogues d’offres IHS Towers Cameroon 2024 et exposé des motifs.
- `DOC-DECIS-007` : Décision N° 00000112/ART/DG/DT du 28 juin 2016 - Procédure de dérogation à la limitation des cartes SIM.
- `DOC-DECIS-008` : Décision ART Projet Consolidé (avril 2021) - Modalités de publication des cartes de couverture réseau et performance QoS.

### Directives (2 documents)
- `DOC-DIR-001` : Directive N° 02/08-UEAC-133-CM-18 du 19 décembre 2008 (CEMAC) - Protection des droits des utilisateurs de réseaux et services de communications électroniques.
- `DOC-DIR-002` : Directives Techniques ART (Juin 2015) - Définition des paramètres techniques pour la collecte des données des stations radioélectriques.

### Recueils Officiels et Annuaires (5 documents)
- `DOC-REC-001` : Recueil des textes du secteur des Postes, Télécommunications et TIC - Édition 2023 (MINPOSTEL, 464 pages).
- `DOC-REC-002` : Recueil des textes juridiques et réglementaires 2012-2013 (ART / DCC, juillet 2016, 80 pages).
- `DOC-REC-003` : Recueil des textes du secteur des communications électroniques - Édition CD-ROM 2018 (ART, 486 pages).
- `DOC-REC-004` : Recueil des textes du secteur des communications électroniques - Édition Lite 2017 (ART, 366 pages).
- `DOC-REC-005` : Recueil des données statistiques du secteur des télécommunications 2007-2011 (ART, observatoire économique, 127 pages).
