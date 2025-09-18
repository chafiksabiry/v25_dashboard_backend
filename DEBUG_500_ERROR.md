# 🚨 Debug - Erreur 500 Backend

## 📊 **Analyse des Logs**

D'après les logs frontend :
```
✅ API Call 1/96: +25 leads (Total: 25)  // Premier appel OK
❌ POST /process-paginated 500 (Internal Server Error)  // Appels suivants KO
```

## 🔍 **Diagnostic**

### **Ce qui fonctionne** ✅
- Architecture frontend : Boucle correcte
- 1er appel backend : Succès (25 leads)
- Fonction `processPageDirectlyWithOpenAI` : Définie

### **Ce qui échoue** ❌
- Appels 2, 3, 4, 5, 6... : Erreur 500
- Backend crash sur `processPageDirectlyWithOpenAI`

## 🛠 **Corrections Apportées**

### **1. Remplacement fetch → axios**
```javascript
// AVANT (problématique)
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  // fetch pas disponible dans Node.js par défaut
});

// MAINTENANT (corrigé)
const axios = require('axios');
const response = await axios.post('https://api.openai.com/v1/chat/completions', {
  // axios disponible dans le projet
});
```

### **2. Gestion d'erreurs améliorée**
```javascript
catch (error) {
  if (error.response) {
    console.error(`❌ OpenAI API error: ${error.response.status}`);
  } else if (error.request) {
    console.error('❌ No response from OpenAI API');
  } else {
    console.error(`❌ Request setup error: ${error.message}`);
  }
}
```

### **3. Logs de débogage ajoutés**
```javascript
console.log(`🚀 Making OpenAI API call for ${dataRowCount} rows...`);
console.log(`🔄 About to process page ${page} with ${pageLines.length} lines...`);
console.log(`✅ OpenAI API call successful, processing response...`);
```

## 🎯 **Tests Recommandés**

### **Test 1 : Vérifier les logs backend**
```bash
# Dans le terminal backend, surveiller :
🚀 Making OpenAI API call for 25 rows...
✅ OpenAI API call successful, processing response...
✅ Page 2 processed successfully: 25 leads extracted

# Si erreur :
❌ Error in processPageDirectlyWithOpenAI: [DETAILS]
```

### **Test 2 : Test avec petit fichier**
- Utiliser fichier de 50 lignes (2 pages seulement)
- Observer si la 2ème page passe

### **Test 3 : Test direct de l'endpoint**
```bash
curl -X POST \
  -F "file=@test_small.csv" \
  -F "page=2" \
  -F "pageSize=25" \
  https://api-dashboard.harx.ai/api/file-processing/process-paginated
```

## 🔧 **Solutions Possibles**

### **Si erreur OpenAI API** :
- Vérifier clé API OpenAI
- Vérifier quotas/limites
- Vérifier format du prompt

### **Si erreur axios** :
```bash
cd v25_dashboard_backend
npm install axios  # Si pas installé
```

### **Si erreur de parsing** :
- Vérifier format CSV des pages 2+
- Vérifier encoding du fichier
- Vérifier colonnes manquantes

## 📈 **Résultats Attendus Après Fix**

```
Frontend Logs:
✅ API Call 1/96: +25 leads (Total: 25)
✅ API Call 2/96: +25 leads (Total: 50)  // Devrait marcher !
✅ API Call 3/96: +25 leads (Total: 75)
...

Backend Logs:
🚀 Making OpenAI API call for 25 rows...
✅ OpenAI API call successful, processing response...
✅ Page 2 processed successfully: 25 leads extracted
🚀 Making OpenAI API call for 25 rows...
✅ Page 3 processed successfully: 25 leads extracted
```

## 🎯 **Actions Immédiates**

1. **Redémarrer le backend** avec les corrections
2. **Tester avec fichier de 50 lignes** (2 pages)
3. **Observer les logs backend** en temps réel
4. **Si encore erreur 500**, vérifier les détails dans les logs

**Le 1er appel fonctionne = La base est solide ! Il faut juste corriger l'implémentation `processPageDirectlyWithOpenAI`.** 🚀
