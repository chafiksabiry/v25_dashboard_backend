# Guide de test Postman - File Processing API

## Configuration Postman

### 1. Créer une nouvelle collection

1. Ouvrez Postman
2. Créez une nouvelle collection nommée "File Processing API"
3. Ajoutez les variables d'environnement :
   - `base_url` : `http://localhost:3000` (ou votre port backend)
   - `user_id` : ID utilisateur test (ex: `507f1f77bcf86cd799439011`)
   - `company_id` : ID entreprise test (ex: `507f1f77bcf86cd799439012`)
   - `gig_id` : ID gig test (ex: `507f1f77bcf86cd799439013`)

### 2. Configuration de la requête

#### URL et Méthode
- **Méthode** : `POST`
- **URL** : `{{base_url}}/api/file-processing/process`

#### Headers
```
Authorization: Bearer {{gig_id}}:{{user_id}}
```

#### Body
- Type : `form-data`
- Paramètres :
  - `file` : [FILE] - Sélectionnez votre fichier CSV/Excel
  - `userId` : `{{user_id}}`
  - `companyId` : `{{company_id}}`
  - `gigId` : `{{gig_id}}`

## Fichiers de test

### 1. Créer un fichier CSV simple (`test_contacts.csv`)

```csv
Prénom,Nom,Email,Phone
Jean,Dupont,jean.dupont@email.com,+33123456789
Marie,Martin,marie.martin@email.com,+33987654321
Pierre,Durand,pierre.durand@email.com,+33456789123
Sophie,Lefebvre,sophie.lefebvre@email.com,+33789123456
```

### 2. Créer un fichier Excel (`test_contacts.xlsx`)

Utilisez Excel ou LibreOffice pour créer un fichier avec les mêmes données que le CSV ci-dessus.

## Étapes de test

### Test 1 : Upload basique

1. **Configuration** :
   - Method: POST
   - URL: `http://localhost:3000/api/file-processing/process`
   - Authorization: `Bearer 507f1f77bcf86cd799439013:507f1f77bcf86cd799439011`

2. **Body (form-data)** :
   ```
   file: [Sélectionner test_contacts.csv]
   userId: 507f1f77bcf86cd799439011
   companyId: 507f1f77bcf86cd799439012
   gigId: 507f1f77bcf86cd799439013
   ```

3. **Réponse attendue** :
   ```json
   {
     "success": true,
     "data": {
       "leads": [
         {
           "userId": {"$oid": "507f1f77bcf86cd799439011"},
           "companyId": {"$oid": "507f1f77bcf86cd799439012"},
           "gigId": {"$oid": "507f1f77bcf86cd799439013"},
           "Deal_Name": "Jean Dupont",
           "Email_1": "jean.dupont@email.com",
           "Phone": "+33123456789",
           "Stage": "New",
           "Pipeline": "Sales Pipeline"
         },
         // ... autres leads
       ],
       "validation": {
         "totalRows": 4,
         "validRows": 4,
         "invalidRows": 0,
         "errors": []
       }
     }
   }
   ```

### Test 2 : Erreurs de validation

#### Test sans fichier
```
Body: 
userId: 507f1f77bcf86cd799439011
companyId: 507f1f77bcf86cd799439012
gigId: 507f1f77bcf86cd799439013
(pas de fichier)
```

**Réponse attendue** :
```json
{
  "success": false,
  "error": "No file uploaded"
}
```

#### Test sans paramètres requis
```
Body:
file: [test_contacts.csv]
(sans userId, companyId, gigId)
```

**Réponse attendue** :
```json
{
  "success": false,
  "error": "Missing required parameters: userId, companyId, gigId"
}
```

### Test 3 : Différents formats de fichiers

#### Test avec Excel
```
Body:
file: [test_contacts.xlsx]
userId: 507f1f77bcf86cd799439011
companyId: 507f1f77bcf86cd799439012
gigId: 507f1f77bcf86cd799439013
```

#### Test avec JSON
Créez `test_contacts.json` :
```json
[
  {"Prénom": "Jean", "Nom": "Dupont", "Email": "jean.dupont@email.com", "Phone": "+33123456789"},
  {"Prénom": "Marie", "Nom": "Martin", "Email": "marie.martin@email.com", "Phone": "+33987654321"}
]
```

### Test 4 : Gros fichier (test de chunking)

Créez un fichier CSV avec 300+ lignes pour tester le chunking automatique.

## Variables d'environnement Postman

Créez un environnement "File Processing Test" avec :

```json
{
  "name": "File Processing Test",
  "values": [
    {
      "key": "base_url",
      "value": "http://localhost:3000",
      "enabled": true
    },
    {
      "key": "user_id",
      "value": "507f1f77bcf86cd799439011",
      "enabled": true
    },
    {
      "key": "company_id",
      "value": "507f1f77bcf86cd799439012",
      "enabled": true
    },
    {
      "key": "gig_id",
      "value": "507f1f77bcf86cd799439013",
      "enabled": true
    },
    {
      "key": "auth_token",
      "value": "{{gig_id}}:{{user_id}}",
      "enabled": true
    }
  ]
}
```

## Collection Postman complète

Voici le JSON de la collection complète à importer :

```json
{
  "info": {
    "name": "File Processing API",
    "description": "Tests pour l'API de traitement de fichiers avec OpenAI"
  },
  "item": [
    {
      "name": "Process File - Success",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{auth_token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": []
            },
            {
              "key": "userId",
              "value": "{{user_id}}",
              "type": "text"
            },
            {
              "key": "companyId",
              "value": "{{company_id}}",
              "type": "text"
            },
            {
              "key": "gigId",
              "value": "{{gig_id}}",
              "type": "text"
            }
          ]
        },
        "url": {
          "raw": "{{base_url}}/api/file-processing/process",
          "host": ["{{base_url}}"],
          "path": ["api", "file-processing", "process"]
        }
      }
    },
    {
      "name": "Process File - No File Error",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{auth_token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "userId",
              "value": "{{user_id}}",
              "type": "text"
            },
            {
              "key": "companyId",
              "value": "{{company_id}}",
              "type": "text"
            },
            {
              "key": "gigId",
              "value": "{{gig_id}}",
              "type": "text"
            }
          ]
        },
        "url": {
          "raw": "{{base_url}}/api/file-processing/process",
          "host": ["{{base_url}}"],
          "path": ["api", "file-processing", "process"]
        }
      }
    },
    {
      "name": "Process File - Missing Params Error",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{auth_token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": []
            }
          ]
        },
        "url": {
          "raw": "{{base_url}}/api/file-processing/process",
          "host": ["{{base_url}}"],
          "path": ["api", "file-processing", "process"]
        }
      }
    }
  ]
}
```

## Vérifications importantes

### Avant de tester :

1. **Backend démarré** : `npm run dev` dans v25_dashboard_backend
2. **Variable d'environnement** : `OPENAI_API_KEY` configurée dans .env
3. **Base de données** : MongoDB connectée
4. **Ports** : Backend sur le bon port (généralement 3000)

### Logs à surveiller :

- Console du backend pour les logs de traitement
- Erreurs OpenAI dans les logs serveur
- Temps de traitement pour les gros fichiers

## Dépannage

### Erreur 500 - Internal Server Error
- Vérifiez les logs du backend
- Vérifiez que OPENAI_API_KEY est configurée
- Vérifiez la connectivité à l'API OpenAI

### Erreur 400 - Bad Request
- Vérifiez que tous les paramètres requis sont présents
- Vérifiez le format du fichier uploadé

### Timeout
- Pour les gros fichiers, augmentez le timeout dans Postman
- Vérifiez les logs backend pour voir le progrès du chunking
