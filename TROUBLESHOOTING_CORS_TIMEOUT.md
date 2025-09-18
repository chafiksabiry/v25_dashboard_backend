# 🚨 Guide de Dépannage - CORS & Timeout

## 🔍 Problèmes Observés

D'après les logs, nous avons ces erreurs :
```
❌ CORS: No 'Access-Control-Allow-Origin' header
❌ 504 Gateway Time-out
⚠️ API Call 2/48 failed, retrying...
⚠️ API Call 3/48 failed, retrying...
```

## ✅ Solutions Implémentées

### 1. **Réduction de la Taille des Pages**
- **Avant** : `pageSize = 50` lignes par appel
- **Maintenant** : `pageSize = 25` lignes par appel
- **Résultat** : Chaque appel API traite 2x moins de données = 2x plus rapide

### 2. **Système de Retry Automatique**
```javascript
// Retry automatique jusqu'à 3 tentatives
while (retryCount <= maxRetries) {
  try {
    pageResponse = await fetch(...);
    break; // Succès
  } catch (fetchError) {
    retryCount++;
    if (retryCount <= maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Pause 2s
      // Retry...
    }
  }
}
```

### 3. **Pause Augmentée Entre Appels**
- **Avant** : 300ms entre appels
- **Maintenant** : 1000ms (1 seconde) entre appels
- **Résultat** : Moins de charge sur le serveur

### 4. **Backend Timeout Optimisé**
- **Timeout par page** : 2 minutes (120000ms)
- **Pages plus petites** : 25 lignes = traitement plus rapide
- **Moins de risque de timeout**

## 🔧 Configuration Nginx Recommandée

```nginx
location /api/ {
    proxy_pass http://backend;
    
    # Timeouts augmentés pour pagination
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    # CORS Headers
    add_header 'Access-Control-Allow-Origin' 'https://v25.harx.ai' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type' always;
    
    # Disable buffering for real-time response
    proxy_buffering off;
    proxy_cache off;
}
```

## 📊 Performance Attendue

### **Avant (50 lignes/page)**
```
📡 API Call 1: 50 lignes → ~90s traitement → ❌ Timeout
📡 API Call 2: 50 lignes → ~90s traitement → ❌ Timeout
```

### **Maintenant (25 lignes/page)**
```
📡 API Call 1: 25 lignes → ~45s traitement → ✅ Succès
📡 API Call 2: 25 lignes → ~45s traitement → ✅ Succès
📡 API Call 3: 25 lignes → ~45s traitement → ✅ Succès
```

## 🎯 Exemple Concret

**Fichier 2400 lignes :**
- **Avant** : 48 appels × 50 lignes = Timeouts fréquents
- **Maintenant** : 96 appels × 25 lignes = Plus stable

**Temps total estimé :**
- 96 appels × 45s = ~72 minutes
- Avec retry : ~90 minutes maximum
- **Mais aucun timeout !**

## 🚀 Test Recommandé

1. **Tester avec fichier plus petit** (100 lignes = 4 appels)
2. **Observer les logs** : 
   ```
   📡 API Call 1/4: Getting file info...
   ✅ API Call 1/4: +25 leads (Total: 25)
   📡 API Call 2/4: Processing page 2/4...
   ✅ API Call 2/4: +25 leads (Total: 50)
   ```

3. **Vérifier que les retry fonctionnent** :
   ```
   ⚠️ API Call 3 attempt 1 failed, retrying in 2s...
   ✅ API Call 3/4: +25 leads (Total: 75)
   ```

## 🔍 Debugging

Si les erreurs persistent :

1. **Vérifier CORS backend** :
   ```bash
   curl -H "Origin: https://v25.harx.ai" \
        -H "Access-Control-Request-Method: POST" \
        -X OPTIONS \
        https://api-dashboard.harx.ai/api/file-processing/process-paginated
   ```

2. **Tester timeout** :
   ```bash
   # Test avec petit fichier
   curl -X POST \
        -F "file=@small_test.csv" \
        -F "page=1" \
        -F "pageSize=10" \
        https://api-dashboard.harx.ai/api/file-processing/process-paginated
   ```

3. **Logs backend** à surveiller :
   ```
   📄 Processing file page 1 with pageSize 25
   📊 Page 1/4: Processing 25 rows (1-25)
   ✅ Page 1 processed: 25 leads extracted
   ```

## ✅ Résultat Attendu

Avec ces optimisations, le système devrait :
- ✅ Éviter les timeouts 504
- ✅ Gérer les erreurs CORS avec retry
- ✅ Traiter les gros fichiers de façon fiable
- ✅ Afficher les leads progressivement

**Pages plus petites = Appels plus rapides = Moins de timeouts !**
