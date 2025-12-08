# 🕐 30-Day Trial Tracking System

## Overview
Système de suivi automatique des utilisateurs qui ont utilisé l'application pendant 30 jours ou plus. L'admin reçoit des alertes dans le dashboard pour contacter ces utilisateurs.

---

## 🎯 Fonctionnalités

### ✅ **Tracking Automatique**
- **Premier démarrage**: La date `first_used_at` est enregistrée quand l'utilisateur démarre le bot pour la première fois
- **Calcul automatique**: Le système calcule les jours d'utilisation (date actuelle - first_used_at)
- **Pas de blocage**: Les utilisateurs peuvent continuer à utiliser l'app après 30 jours

### 📊 **Admin Dashboard**
- **Section dédiée**: "⚠️ Trial Expiring Users (30+ Days)"
- **Badge visuel**: 
  - 🔔 **NEW** (jaune) = Utilisateurs non encore contactés
  - ✓ **Notified** (gris) = Utilisateurs déjà contactés
- **Statistiques**: Total, nouveaux, notifiés
- **Détails affichés**:
  - Nom du tenant
  - Propriétaire
  - Email
  - Date première utilisation
  - Nombre de jours utilisés

### 🔔 **Système de Notification**
- **Mark as Notified**: Bouton pour marquer un utilisateur comme contacté
- **Évite les doublons**: Les utilisateurs marqués n'apparaissent plus dans les alertes actives
- **Historique**: Garde la trace de qui a été notifié

---

## 📂 Structure Base de Données

### Nouvelles Colonnes dans `tenants`

```sql
first_used_at TIMESTAMP        -- Date première utilisation (quand bot démarre)
trial_notified BOOLEAN          -- true si admin a contacté l'utilisateur
```

### Index
```sql
idx_tenants_first_used_at       -- Performance pour requêtes de date
idx_tenants_trial_notified      -- Performance pour filtrer notifiés
```

---

## 🔧 Endpoints API

### 1. **GET /api/admin/trial-alerts**
Récupère la liste des utilisateurs 30+ jours

**Query Params:**
- `adminKey` (required) - Clé admin pour authentification

**Response:**
```json
{
  "total": 5,
  "unnotified": 3,
  "notified": 2,
  "users": [
    {
      "id": 1,
      "name": "TechStore",
      "email": "owner@techstore.com",
      "first_used_at": "2025-11-01T10:00:00Z",
      "days_used": 37,
      "trial_notified": false,
      "owner_name": "John Doe",
      "owner_email": "john@techstore.com"
    }
  ],
  "timestamp": "2025-12-08T12:00:00Z"
}
```

### 2. **POST /api/admin/mark-notified/:tenantId**
Marque un utilisateur comme notifié

**Body:**
```json
{
  "adminKey": "your-admin-key"
}
```

**Response:**
```json
{
  "message": "Tenant marked as notified",
  "tenantId": 1,
  "timestamp": "2025-12-08T12:00:00Z"
}
```

---

## 🚀 Utilisation

### 1. **Exécuter la Migration**
Après déploiement, exécuter la migration pour ajouter les colonnes:

```bash
POST https://your-app.railway.app/api/admin/migrate
Body: { "adminKey": "your-admin-key" }
```

Ou automatiquement au démarrage via `db.initialize()`

### 2. **Accéder au Dashboard Admin**
```
https://your-app.railway.app/admin.html
```

1. Entrer la clé admin (`ADMIN_KEY` from .env)
2. Cliquer "🔓 Unlock Panel"
3. Voir la section "⚠️ Trial Expiring Users"

### 3. **Workflow Admin**

1. **Dashboard affiche alerte**: "🚨 3 users have used the app for 30+ days"
2. **Admin voit la liste** avec détails de chaque utilisateur
3. **Admin contacte l'utilisateur** (email, téléphone, etc.)
4. **Admin clique "✓ Mark as Notified"**
5. **Utilisateur passe en gris** ("✓ Notified")

---

## 🔄 Fonctionnement Technique

### Tracking du Premier Usage

**Fichier**: `server.js` (ligne ~385)
```javascript
// Track first usage (for 30-day trial tracking)
await db.setTenantFirstUsed(req.tenant.id);
```

**Méthode DB**: `database/db.js`
```javascript
async setTenantFirstUsed(tenantId) {
    const query = `
        UPDATE tenants 
        SET first_used_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND first_used_at IS NULL
    `;
    // S'exécute seulement si first_used_at est NULL
}
```

### Récupération des Alertes

**Méthode DB**: `database/db.js`
```javascript
async getTrialExpiringTenants() {
    const query = `
        SELECT 
            EXTRACT(DAY FROM (CURRENT_TIMESTAMP - t.first_used_at)) as days_used
        FROM tenants t
        WHERE t.first_used_at IS NOT NULL
        AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - t.first_used_at)) >= 30
    `;
    // Retourne seulement les utilisateurs 30+ jours
}
```

### Backfill des Utilisateurs Existants

**Fichier**: `database/migrate.sql`
```sql
UPDATE tenants t
SET first_used_at = (
    SELECT MIN(created_at) 
    FROM whatsapp_connections wc 
    WHERE wc.tenant_id = t.id
)
WHERE first_used_at IS NULL;
```

Cette requête remplit automatiquement `first_used_at` pour les utilisateurs existants en utilisant la date de leur première connexion WhatsApp.

---

## 📝 Variables d'Environnement

```env
ADMIN_KEY=admin-secret-key-change-this-12345
```

Utilisée pour:
- Accès au dashboard admin
- Endpoints `/api/admin/*`
- Marquer utilisateurs comme notifiés

---

## 🎨 Interface Admin

### Section Trial Alerts
- **Background jaune** (`#fff3cd`) pour utilisateurs non notifiés
- **Background gris** (`#f8f9fa`) pour utilisateurs notifiés
- **Badge rouge** sur nombre de jours si ≥ 30
- **Bouton vert** "✓ Mark as Notified" pour nouveaux

### Statistiques
```
🚨 5 users have used the app for 30+ days
📊 3 new alerts | 2 already notified
```

---

## 🔐 Sécurité

1. **Authentification requise**: Tous les endpoints admin nécessitent `ADMIN_KEY`
2. **Pas de données sensibles**: Les alertes n'exposent pas de passwords ou tokens
3. **Lecture seule pour users**: Les utilisateurs ne voient pas leurs propres stats de trial

---

## 🧪 Testing

### Test Complet du Flux

1. **Créer un nouvel utilisateur**
   ```
   POST /api/auth/register
   ```

2. **Approuver l'utilisateur**
   ```
   POST /api/admin/approve-user/:userId
   ```

3. **User démarre le bot** (première fois)
   ```
   POST /api/start
   ```
   → `first_used_at` est enregistré

4. **Simuler 30 jours** (pour test rapide):
   ```sql
   UPDATE tenants 
   SET first_used_at = CURRENT_TIMESTAMP - INTERVAL '31 days'
   WHERE id = 1;
   ```

5. **Vérifier dans admin dashboard**
   ```
   GET /admin.html
   ```
   → Devrait apparaître dans "Trial Expiring Users"

6. **Marquer comme notifié**
   ```
   POST /api/admin/mark-notified/1
   ```

7. **Vérifier le changement**
   → Badge passe de "🔔 NEW" à "✓ Notified"

---

## 📊 Métriques

Le système track automatiquement:
- ✅ Nombre total d'utilisateurs 30+ jours
- ✅ Nombre d'utilisateurs non contactés
- ✅ Nombre d'utilisateurs déjà notifiés
- ✅ Jours exacts d'utilisation par utilisateur
- ✅ Date première utilisation

---

## 🎯 Cas d'Usage

### Scénario 1: Conversion Trial → Paid
Admin voit utilisateur avec 35 jours d'utilisation:
1. Contacte par email: "Vous utilisez notre service depuis 35 jours!"
2. Propose upgrade vers plan payant
3. Marque comme "Notified" dans dashboard

### Scénario 2: Feedback Users
Admin voit utilisateur avec 60 jours:
1. Demande feedback sur l'expérience
2. Collecte suggestions d'amélioration
3. Marque comme "Notified"

### Scénario 3: Support Proactif
Admin voit utilisateur avec 90 jours:
1. Vérifie s'il rencontre des problèmes
2. Offre session d'onboarding avancée
3. Marque comme "Notified"

---

## 🔄 Maintenance

### Nettoyage des Anciennes Alertes
Si vous voulez réinitialiser le statut "notified":

```sql
UPDATE tenants 
SET trial_notified = false 
WHERE first_used_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
```

### Exporter les Stats
```sql
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE first_used_at IS NOT NULL) as active_users,
    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM (CURRENT_TIMESTAMP - first_used_at)) >= 30) as trial_expired,
    COUNT(*) FILTER (WHERE trial_notified = true) as notified_users
FROM tenants
WHERE is_active = true;
```

---

## ⚠️ Notes Importantes

1. **Pas de blocage automatique**: Le système ne bloque JAMAIS un utilisateur après 30 jours
2. **Simple notification**: C'est seulement un outil d'alerte pour l'admin
3. **Manuel**: L'admin décide quoi faire (contact, upgrade, rien)
4. **Historique**: Les utilisateurs marqués "notified" restent visibles dans la liste
5. **Backfill**: Les utilisateurs existants sont automatiquement trackés depuis leur première connexion

---

## 🚀 Prochaines Améliorations Possibles

- [ ] Email automatique aux utilisateurs à 30 jours
- [ ] Notifications Slack/Discord pour admin
- [ ] Dashboard utilisateur avec leurs propres stats
- [ ] Plans tarifaires avec limites automatiques
- [ ] Export CSV des utilisateurs trial
- [ ] Graphiques d'utilisation par période

---

## 📞 Support

Pour questions ou problèmes:
1. Vérifier les logs Railway pour erreurs
2. Tester les endpoints avec Postman
3. Vérifier que la migration a bien été exécutée
4. Confirmer que `ADMIN_KEY` est correct

---

**Version**: 1.0.0  
**Date**: December 8, 2025  
**Auteur**: APIWhatsapp Team
