# File Processing avec OpenAI - Configuration

## Vue d'ensemble

Le système de traitement de fichiers a été modifié pour déplacer les appels OpenAI du frontend vers le backend. Cela améliore la sécurité et les performances.

## Configuration requise

### Variables d'environnement

Ajoutez la variable suivante dans votre fichier `.env` du backend :

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### Dépendances

Les dépendances suivantes sont déjà installées dans le backend :
- `multer` : pour l'upload de fichiers
- `xlsx` : pour le traitement des fichiers Excel

## Architecture

### Backend (v25_dashboard_backend)

#### Nouveau endpoint : `/api/file-processing/process`

- **Méthode** : POST
- **Content-Type** : multipart/form-data
- **Paramètres** :
  - `file` : Le fichier à traiter (CSV, Excel, JSON, TXT)
  - `userId` : ID de l'utilisateur
  - `companyId` : ID de l'entreprise  
  - `gigId` : ID du gig

#### Fonctionnalités

1. **Upload sécurisé** : Utilise multer avec limite de 50MB
2. **Traitement multi-format** : Support CSV, Excel (.xlsx, .xls), JSON, TXT
3. **Traitement OpenAI intelligent** :
   - Chunking automatique pour les gros fichiers
   - Traitement parallèle des chunks
   - Récupération JSON robuste
4. **Nettoyage des données** : Nettoyage automatique des emails
5. **Validation** : Validation complète des données traitées

#### Fichiers modifiés/ajoutés

- `src/routes/file-processing.js` : Nouveau endpoint de traitement
- `src/app.js` : Ajout de la route file-processing
- `src/config/env.js` : Ajout de la configuration OpenAI

### Frontend (v25_comporchestrator_front)

#### Modifications apportées

1. **Suppression de la logique OpenAI** :
   - Suppression des appels directs à l'API OpenAI
   - Suppression des fonctions de chunking
   - Suppression des utilitaires de récupération JSON

2. **Nouvelle fonction `processFileWithBackend`** :
   - Upload direct du fichier vers le backend
   - Suivi de progression simplifié
   - Gestion d'erreurs améliorée

3. **Simplification du processus** :
   - Plus besoin de lire le contenu du fichier côté frontend
   - Plus besoin de la librairie XLSX côté frontend
   - Interface utilisateur inchangée

#### Fichiers modifiés

- `src/components/onboarding/UploadContacts.tsx` : Logique de traitement simplifiée

## Avantages de la nouvelle architecture

### Sécurité
- Clé API OpenAI protégée côté serveur
- Pas d'exposition de la clé dans le code client
- Validation côté serveur

### Performance
- Traitement parallèle optimisé
- Chunking intelligent des gros fichiers
- Moins de transfert de données entre client et serveur

### Maintenance
- Logique centralisée côté backend
- Plus facile à déboguer et monitorer
- Logs serveur pour le suivi

## Tests

### Test basique

1. Démarrez le backend avec la clé OpenAI configurée
2. Sélectionnez un gig dans le frontend
3. Uploadez un fichier CSV/Excel avec des contacts
4. Vérifiez que les leads sont correctement traités et sauvegardés

### Fichiers de test recommandés

- CSV simple avec colonnes : Prénom, Nom, Email, Phone
- Excel avec multiples feuilles
- Fichier volumineux (>1000 lignes) pour tester le chunking

## Dépannage

### Erreurs communes

1. **"OpenAI API key not configured"** 
   - Vérifiez que `OPENAI_API_KEY` est défini dans `.env`
   - Redémarrez le serveur backend

2. **"Backend error: 500"**
   - Vérifiez les logs du serveur backend
   - Vérifiez la validité de la clé OpenAI

3. **"Missing required parameters"**
   - Vérifiez que userId, companyId et gigId sont bien envoyés

### Logs

Les logs détaillés sont disponibles dans la console du serveur backend pour le débogage.
