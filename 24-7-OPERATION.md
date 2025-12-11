# Configuration 24/7 - Fonctionnement Continu

## 🎯 Objectif
Maintenir le bot WhatsApp actif 24 heures sur 24, 7 jours sur 7, sans interruption ni mise en veille.

## 🔧 Solutions Implémentées

### 1. Service Keep-Alive
**Fichier**: `services/keepAlive.js`

Un service qui envoie un ping automatique toutes les 10 minutes pour :
- Empêcher Railway de mettre l'application en veille
- Maintenir les connexions actives
- Vérifier la santé du système

**Fonctionnement**:
```
Intervalle: 10 minutes
URL: https://[votre-app].railway.app/health
Méthode: GET avec timeout de 10s
Stats: /api/keepalive
```

### 2. Timeouts de Session Prolongés
**Avant**:
- Inactivité: 1 heure → Session fermée
- Âge max: 24 heures → Session fermée
- Cleanup: Toutes les 5 minutes

**Maintenant (24/7)**:
- Inactivité: **24 heures** → Session fermée
- Âge max: **7 jours** → Session fermée
- Cleanup: Toutes les **1 heure**

Cela signifie que les bots WhatsApp restent connectés beaucoup plus longtemps, même sans activité.

### 3. Configuration Automatique
Le service keep-alive démarre automatiquement au lancement du serveur après 5 secondes d'initialisation.

## 📊 Monitoring

### Vérifier l'état du Keep-Alive
```bash
GET https://[votre-app].railway.app/api/keepalive
```

**Réponse**:
```json
{
  "isRunning": true,
  "uptime": 3600000,
  "uptimeHours": "1.0",
  "pingCount": 6,
  "failedPings": 0,
  "successRate": "100.0",
  "healthUrl": "https://[votre-app].railway.app/health",
  "pingInterval": 600000
}
```

### Stats dans les Logs
Le service affiche automatiquement:
- ✅ Ping réussi avec temps de réponse
- ❌ Ping échoué avec raison
- 📊 Stats complètes toutes les 10 pings (~100 minutes)

**Exemple de logs**:
```
💗 Keep-alive service started
   Ping URL: https://apiwhatsaap-production.up.railway.app/health
   Interval: 600s (10min)
💗 Keep-alive ping #1 successful (45ms)
💗 Keep-alive ping #2 successful (52ms)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💗 Keep-Alive Stats:
   Uptime: 1.7h
   Total Pings: 10
   Failed Pings: 0
   Success Rate: 100.0%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## ⚙️ Configuration (.env)

```env
# Session management - Optimized for 24/7 operation
SESSION_INACTIVE_TIMEOUT=86400000     # 24 hours
SESSION_MAX_AGE=604800000             # 7 days
SESSION_CLEANUP_INTERVAL=3600000      # 1 hour

# Keep-alive settings
KEEP_ALIVE_ENABLED=true
KEEP_ALIVE_INTERVAL=600000            # 10 minutes
```

### Désactiver le Keep-Alive (si nécessaire)
Pour désactiver temporairement:
```env
KEEP_ALIVE_ENABLED=false
```

## 🚨 Alertes et Diagnostics

### Alertes Automatiques
Le système génère des alertes si:
- **3 pings consécutifs échouent**: `🚨 ALERT: 3 consecutive keep-alive failures!`
- Problème potentiel de connectivité ou serveur

### Vérification Manuelle
1. **État du service**:
   ```bash
   curl https://[votre-app].railway.app/api/keepalive
   ```

2. **Santé du serveur**:
   ```bash
   curl https://[votre-app].railway.app/health
   ```

3. **Métriques système**:
   ```bash
   curl https://[votre-app].railway.app/api/metrics
   ```

## 📈 Impact sur les Performances

### Avant (Configuration Standard)
- Sessions fermées après 1h d'inactivité
- Application peut dormir après 30min sans requêtes
- Bots doivent se reconnecter fréquemment
- **Downtime**: Possible pendant les heures creuses

### Après (Configuration 24/7)
- Sessions maintenues pendant 24h minimum
- Application toujours active (ping toutes les 10min)
- Bots restent connectés en permanence
- **Downtime**: Proche de zéro (99.9% uptime)

### Consommation de Ressources
- **Keep-alive**: Très faible (~1 requête/10min)
- **RAM**: Légèrement plus élevée (sessions conservées plus longtemps)
- **CPU**: Impact minimal (cleanup moins fréquent)
- **Bandwidth**: +~6 requêtes/heure (négligeable)

## 🔄 Plans Railway

### Hobby ($5/mois)
- ✅ Keep-alive fonctionne parfaitement
- ✅ Pas de mise en veille automatique
- ✅ Uptime garanti
- **Capacité**: 30-40 utilisateurs simultanés

### Pro ($20/mois)
- ✅ Keep-alive + resources supplémentaires
- ✅ Performances optimales
- ✅ Scaling automatique
- **Capacité**: 100-150 utilisateurs simultanés

## 🐛 Dépannage

### Problème: Le bot s'arrête quand même

**Vérifications**:
1. Logs Railway: Rechercher "Keep-alive service started"
2. Variable d'environnement: `KEEP_ALIVE_ENABLED=true`
3. Endpoint santé: Tester `/health` manuellement
4. Plan Railway: Le plan Starter gratuit peut avoir des limitations

**Solutions**:
```bash
# Vérifier les logs
railway logs

# Tester le keep-alive
curl https://[votre-app].railway.app/api/keepalive

# Redémarrer le service
railway restart
```

### Problème: Trop de pings échoués

**Causes possibles**:
- Problème de DNS ou réseau
- Endpoint `/health` ne répond pas
- Timeout trop court (10s)

**Solutions**:
- Vérifier que `/health` est accessible
- Augmenter le timeout dans `keepAlive.js`
- Vérifier les logs Railway pour erreurs

### Problème: Sessions toujours fermées

**Vérifications**:
1. Variables dans `.env`:
   ```env
   SESSION_INACTIVE_TIMEOUT=86400000  # 24h
   SESSION_MAX_AGE=604800000          # 7 jours
   ```

2. Code dans `multiUserBotManager.js`:
   ```javascript
   this.cleanupConfig = {
       inactiveTimeout: 86400000,     // 24 hours
       maxSessionAge: 604800000       // 7 days
   }
   ```

3. Redéployer après modifications:
   ```bash
   git add .
   git commit -m "Update session timeouts for 24/7"
   git push
   ```

## 📝 Logs à Surveiller

### Démarrage Réussi
```
✅ Server running on port 3000
💗 Keep-alive service started
   Ping URL: https://apiwhatsaap-production.up.railway.app/health
   Interval: 600s (10min)
🧹 Session cleanup started (checking every 3600s)
```

### Opération Normale
```
💗 Keep-alive ping #1 successful (45ms)
💗 Keep-alive ping #2 successful (52ms)
✅ Session cleanup complete: 0/5 sessions removed
```

### Problèmes
```
❌ Keep-alive ping #3 failed: timeout of 10000ms exceeded
🚨 ALERT: 3 consecutive keep-alive failures!
```

## ✅ Checklist de Déploiement

Avant de déployer pour le fonctionnement 24/7:

- [ ] `services/keepAlive.js` créé
- [ ] `server.js` importe et démarre keepAlive
- [ ] `.env` contient les timeouts prolongés
- [ ] `multiUserBotManager.js` utilise les nouveaux timeouts
- [ ] `package.json` contient axios (dépendance)
- [ ] Variables Railway configurées:
  - [ ] `KEEP_ALIVE_ENABLED=true`
  - [ ] `SESSION_INACTIVE_TIMEOUT=86400000`
  - [ ] `SESSION_MAX_AGE=604800000`
- [ ] Endpoints testés:
  - [ ] `/health` répond 200 OK
  - [ ] `/api/keepalive` retourne stats
  - [ ] `/api/metrics` retourne métriques

## 🎉 Résultat Attendu

Après déploiement:
- ✅ Bot reste connecté 24/7 sans interruption
- ✅ Pas de déconnexions dues à l'inactivité
- ✅ Railway ne met pas l'app en veille
- ✅ Sessions WhatsApp stables pendant des jours
- ✅ Monitoring en temps réel disponible
- ✅ Uptime proche de 99.9%

## 📞 Support

En cas de problème persistant:
1. Vérifier les logs Railway: `railway logs --follow`
2. Tester les endpoints: `/health`, `/api/keepalive`, `/api/metrics`
3. Vérifier les variables d'environnement Railway
4. Redémarrer l'application: `railway restart`
5. Vérifier le plan Railway (Hobby minimum recommandé)

---

**Date de mise en place**: Décembre 2025  
**Version**: 1.0  
**Status**: ✅ Production Ready
