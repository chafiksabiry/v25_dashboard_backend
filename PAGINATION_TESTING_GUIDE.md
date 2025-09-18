# 📄 Guide de Test - Pagination pour Traitement de Fichiers

## 🎯 Objectif
Éviter les erreurs 504 Gateway Timeout en traitant les gros fichiers par pages plus petites.

## 🚀 Nouveau Endpoint

### URL
```
POST https://api-dashboard.harx.ai/api/file-processing/process-paginated
```

### Paramètres
- `file` (fichier) : Le fichier à traiter (CSV, Excel, JSON, TXT)
- `page` (entier, optionnel) : Numéro de page (défaut: 1)
- `pageSize` (entier, optionnel) : Taille de page (défaut: 50)

### Exemple Postman

#### 1. Première Page
```
Method: POST
URL: https://api-dashboard.harx.ai/api/file-processing/process-paginated
Body: form-data
- file: [votre fichier]
- page: 1
- pageSize: 50
```

#### 2. Pages Suivantes
```
Method: POST
URL: https://api-dashboard.harx.ai/api/file-processing/process-paginated
Body: form-data
- file: [même fichier]
- page: 2
- pageSize: 50
```

## 📊 Réponse

### Structure de Réponse
```json
{
  "success": true,
  "data": {
    "leads": [
      {
        "Deal_Name": "John Doe",
        "Email_1": "john@example.com",
        "Phone": "+33123456789",
        "Stage": "New",
        "Pipeline": "Sales Pipeline"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalRows": 250,
      "pageSize": 50,
      "hasNextPage": true,
      "hasPreviousPage": false,
      "processedRows": 50
    }
  }
}
```

## 🔄 Workflow de Test

1. **Upload Page 1** avec `page=1&pageSize=50`
2. **Vérifier** `pagination.totalPages` dans la réponse
3. **Traiter** les pages suivantes : `page=2`, `page=3`, etc.
4. **Combiner** tous les leads des différentes pages

## ✅ Avantages

- ✅ **Pas de timeout** : Chaque page prend moins de 2 minutes
- ✅ **Traitement fiable** : Moins de données par requête = plus stable
- ✅ **Progression visible** : Suivi page par page
- ✅ **Récupération d'erreurs** : Si une page échoue, on peut la reprendre

## 🎯 Tailles Recommandées

- **Petits fichiers** (< 200 lignes) : `pageSize=100` ou endpoint normal
- **Fichiers moyens** (200-1000 lignes) : `pageSize=50`
- **Gros fichiers** (> 1000 lignes) : `pageSize=25`

## 🐛 Gestion d'Erreurs

- **Page vide** : `leads: []` avec `hasNextPage: false`
- **Page invalide** : Erreur 400 avec message explicite
- **Erreur OpenAI** : Erreur 500 avec détails
