# 🤖 Multi-Mode Bot System

## Vue d'Ensemble
Système de bot WhatsApp AI **universel** avec 4 modes configurables pour s'adapter à TOUS les cas d'usage - pas seulement l'e-commerce!

---

## 🎯 Problème Résolu

**AVANT**: Bot centré sur e-commerce uniquement
- ❌ Médecins ne peuvent pas l'utiliser (pas de produits à vendre)
- ❌ Livreurs ne peuvent pas l'utiliser (pas de paiements)
- ❌ Consultants ne peuvent pas l'utiliser (juste des questions/réponses)
- ❌ Limité aux vendeurs avec processus de paiement

**MAINTENANT**: Bot universel pour TOUT LE MONDE
- ✅ Médecins: Mode Conversation (Q&A simple)
- ✅ Livreurs: Mode Delivery (tracking colis)
- ✅ Vendeurs: Mode E-Commerce (produits + paiements)
- ✅ Salons/Docteurs: Mode Appointment (réservations)

---

## 📋 Les 4 Modes Disponibles

### 1. 💬 **Mode Conversational** (PAR DÉFAUT)
**Pour qui**: Médecins, consultants, support client, services généraux

**Fonctionnalités**:
- ✅ Réponses Q&A simples
- ✅ PAS de processus de commande
- ✅ PAS de paiements requis
- ✅ PAS de confirmation d'achat
- ✅ Conversation naturelle et utile
- ✅ Analyse d'images (si envoyées)

**Exemple d'utilisation**:
```
Patient: "Quels sont vos horaires?"
Bot: "Nous sommes ouverts du lundi au vendredi, 9h-17h. Comment puis-je vous aider?"

Patient: "C'est quoi la photosynthèse?"
Bot: "La photosynthèse est le processus par lequel les plantes..."
```

**Idéal pour**:
- 🏥 Cabinets médicaux
- 💼 Consultants
- 📞 Support client
- 🎓 Services éducatifs
- ℹ️ Information générale

---

### 2. 📦 **Mode E-Commerce** (ORIGINAL)
**Pour qui**: Boutiques, vendeurs en ligne, e-commerce

**Fonctionnalités**:
- ✅ Catalogue de produits
- ✅ Détection intention d'achat
- ✅ Confirmation EXPLICITE avec "CONFIRMER"
- ✅ Demande screenshot de paiement
- ✅ Vérification montant via Vision API
- ✅ Collecte infos client (nom/adresse/email)
- ✅ Envoi commande au propriétaire

**Exemple d'utilisation**:
```
Client: "Bghit iPhone 15 Pro Max"
Bot: [Affiche détails produit]
     "🛒 CONFIRMER VOTRE COMMANDE? Répondez: CONFIRMER"

Client: "CONFIRMER"
Bot: "💳 Envoyez screenshot de paiement..."

Client: [Envoie screenshot]
Bot: "✅ Paiement vérifié! Donnez nom/adresse/email..."
```

**Champs requis**:
- Owner WhatsApp Number (pour recevoir commandes)
- Bank RIB (optionnel, pour paiements)

---

### 3. 📅 **Mode Appointment**
**Pour qui**: Médecins, salons, coiffeurs, services sur rendez-vous

**Fonctionnalités**:
- ✅ Réservation de rendez-vous
- ✅ Vérification disponibilité
- ✅ Collecte: Date, Heure, Service, Nom, Téléphone
- ✅ Confirmation de rendez-vous
- ✅ Rappels et modifications

**Exemple d'utilisation**:
```
Patient: "Je voudrais prendre rendez-vous"
Bot: "Avec plaisir! Quel service vous intéresse et pour quelle date?"

Patient: "Consultation demain à 10h"
Bot: "Parfait! Je vérifie la disponibilité... 
     ✅ Disponible! Votre nom et téléphone svp."

Patient: "Mohamed 0612345678"
Bot: "✅ Rendez-vous confirmé pour demain 10h!"
```

**Idéal pour**:
- 🏥 Cabinets médicaux
- 💇 Salons de coiffure
- 🦷 Dentistes
- 💅 Esthétique/Spa
- 🔧 Services techniques

---

### 4. 🚚 **Mode Delivery**
**Pour qui**: Services de livraison, transporteurs, coursiers

**Fonctionnalités**:
- ✅ Tracking de colis
- ✅ Statut de livraison en temps réel
- ✅ Estimations de délai
- ✅ Réponses aux questions d'expédition
- ✅ Mises à jour automatiques

**Exemple d'utilisation**:
```
Client: "Où est mon colis?"
Bot: "Je vais vous aider! Votre numéro de suivi?"

Client: "TRK123456789"
Bot: "📦 Votre colis est en transit!
     📍 Position: Casablanca
     ⏱️ Livraison estimée: Demain 14h-18h"

Client: "Merci!"
Bot: "De rien! Je vous notifierai quand il arrivera."
```

**Idéal pour**:
- 🚚 Services de livraison
- 📦 Transporteurs
- 🏍️ Coursiers
- 📮 Services postaux

---

## 🛠️ Configuration

### 1. Accéder au Dashboard
```
https://your-app.railway.app/dashboard.html
```

### 2. Choisir le Mode Bot

Dans la section "🤖 Bot Mode", sélectionnez:

```
💬 Conversational - Simple Q&A (No Orders)
📦 E-Commerce - Products + Payments
📅 Appointment - Bookings (Doctor, Salon)
🚚 Delivery - Package Tracking
```

### 3. Remplir les Champs Selon le Mode

**Mode Conversational** (Défaut):
- Business Data: Décrivez votre service
- **PAS besoin** de Owner WhatsApp
- **PAS besoin** de RIB

**Mode E-Commerce**:
- Business Data: Catalogue produits avec prix
- ✅ Owner WhatsApp Number (REQUIS pour recevoir commandes)
- Bank RIB (optionnel, pour afficher aux clients)

**Mode Appointment**:
- Business Data: Services disponibles, horaires
- **PAS besoin** de Owner WhatsApp
- **PAS besoin** de RIB

**Mode Delivery**:
- Business Data: Zones de livraison, tarifs
- **PAS besoin** de Owner WhatsApp
- **PAS besoin** de RIB

### 4. Démarrer le Bot

Cliquez "🚀 Start Bot" → Scanner QR code → ✅ Prêt!

---

## 💾 Base de Données

### Nouvelles Colonnes dans `tenants`

```sql
bot_mode VARCHAR(50) DEFAULT 'conversational'
-- Values: 'conversational', 'ecommerce', 'appointment', 'delivery'

bot_config JSONB DEFAULT '{}'
-- Stocke configuration spécifique au mode
```

### Migration

```bash
POST https://your-app.railway.app/migrate.html
```

Ou utiliser l'endpoint:
```bash
POST https://your-app.railway.app/api/admin/migrate
Body: { "adminKey": "your-admin-key" }
```

---

## 🤖 Comportement par Mode

### Conversational
```javascript
// Pas de détection d'achat
// Pas de flux de commande
// Juste réponses IA naturelles
if (botMode === 'conversational') {
    return aiResponse; // Simple Q&A
}
```

### E-Commerce
```javascript
// Détection: "bghit", "je veux"
// Flux: Confirmation → Paiement → Infos → Owner
if (customerShowsInterest && botMode === 'ecommerce') {
    initiateOrderFlow();
}
```

### Appointment
```javascript
// Détection: "rendez-vous", "موعد"
// Collecte: Date, Heure, Service, Nom
if (botMode === 'appointment') {
    handleAppointmentBooking();
}
```

### Delivery
```javascript
// Détection: tracking number, "où est"
// Fournit: Statut, position, estimation
if (botMode === 'delivery') {
    trackPackage();
}
```

---

## 📊 Prompts AI Spécifiques

### Conversational
```
"You are a helpful AI assistant. Answer questions naturally,
provide information, and have helpful conversations. NO SALES."
```

### E-Commerce
```
"You are a sales assistant. Help customers discover products,
answer pricing questions, and guide through purchase process."
```

### Appointment
```
"You are an appointment booking assistant. Help schedule appointments,
check availability, and answer service questions. Be professional."
```

### Delivery
```
"You are a delivery tracking assistant. Help track packages,
provide updates, and answer shipping questions. Be reassuring."
```

---

## 🎯 Cas d'Usage Réels

### Dr. Mohamed - Médecin (Mode Conversational)
```
Patient: "السلام عليكم دكتور"
Bot: "و عليكم السلام! كيف يمكنني مساعدتك اليوم؟"

Patient: "واش عندك موعد غدا؟"
Bot: "نعم، عندي مواعيد متاحة غدا. شنو الوقت المناسب ليك؟"

Patient: "العشرة صباح"
Bot: "ممتاز! موعدك مؤكد غدا الساعة 10 صباحا. شكرا!"
```
✅ **Pas de paiements, pas de produits - juste conversation utile**

---

### TechStore - E-Commerce (Mode E-Commerce)
```
Client: "Bghit iPhone 15 Pro Max"
Bot: "iPhone 15 Pro Max 256GB - 14,500 DH
     ✅ En stock, garantie 1 an
     🛒 CONFIRMER? Répondez: CONFIRMER"

Client: "CONFIRMER"
Bot: "💳 Envoyez screenshot paiement..."
[Flow complet de commande avec vérification]
```
✅ **Processus e-commerce complet avec paiements**

---

### Salon Amira - Coiffeur (Mode Appointment)
```
Cliente: "Je voudrais une coupe demain"
Bot: "Avec plaisir! Quelle heure vous convient? 
     Disponibilités: 10h, 14h, 16h"

Cliente: "14h"
Bot: "Parfait! Rendez-vous demain 14h pour coupe.
     Votre nom et téléphone?"

Cliente: "Sara 0612345678"
Bot: "✅ Confirmé! À demain Sara!"
```
✅ **Réservations simples sans paiement en ligne**

---

### Amana Express - Livraison (Mode Delivery)
```
Client: "أين طلبي؟"
Bot: "غادي نعاونك! عطيني رقم التتبع؟"

Client: "AMN789456123"
Bot: "📦 طلبك في الطريق!
     📍 الموقع: الدار البيضاء
     ⏱️ التوصيل المتوقع: غدا 2-6 مساء"
```
✅ **Tracking de colis en temps réel**

---

## 🔄 Migration d'Utilisateurs Existants

**Automatique**:
```sql
-- Utilisateurs avec owner_whatsapp_number → mode 'ecommerce'
UPDATE tenants 
SET bot_mode = 'ecommerce'
WHERE owner_whatsapp_number IS NOT NULL;

-- Autres utilisateurs → mode 'conversational' (défaut)
-- Peuvent changer dans dashboard
```

---

## ⚙️ Variables d'Environnement

```env
# Aucune nouvelle variable requise!
# Le mode est configuré par utilisateur dans le dashboard
```

---

## 🧪 Testing

### Test Mode Conversational
1. Choisir "💬 Conversational" dans dashboard
2. Ne PAS entrer Owner WhatsApp
3. Démarrer bot
4. Envoyer: "What is AI?"
5. ✅ Devrait répondre normalement sans flux de commande

### Test Mode E-Commerce
1. Choisir "📦 E-Commerce"
2. Entrer Owner WhatsApp Number
3. Envoyer: "I want iPhone"
4. ✅ Devrait déclencher flux de confirmation

### Test Mode Appointment
1. Choisir "📅 Appointment"
2. Envoyer: "Je veux rendez-vous"
3. ✅ Devrait demander date/heure

### Test Mode Delivery
1. Choisir "🚚 Delivery"
2. Envoyer: "Track TRK123"
3. ✅ Devrait demander plus d'infos tracking

---

## 📈 Avantages

### Pour Utilisateurs
- ✅ **Universel**: Convient à TOUS les business (pas juste e-commerce)
- ✅ **Flexible**: Change de mode facilement
- ✅ **Pas de code**: Configuration via interface
- ✅ **Multi-langue**: Arabe, Français, Anglais automatique

### Pour Développeurs
- ✅ **Maintenable**: Code modulaire par mode
- ✅ **Extensible**: Facile d'ajouter nouveaux modes
- ✅ **Testable**: Chaque mode isolé
- ✅ **Robuste**: Validation et checks appropriés

---

## 🚀 Nouveaux Modes Possibles (Futur)

- 🏨 **Hotel Mode** - Réservations chambres
- 🍕 **Restaurant Mode** - Commandes nourriture
- 🎓 **Education Mode** - Cours et tutoriels
- 💰 **Finance Mode** - Conseils financiers
- 🏋️ **Fitness Mode** - Programmes d'entraînement

---

## 📞 Support

**Problème**: Bot ne répond pas comme prévu
**Solution**: Vérifiez le mode sélectionné dans dashboard

**Problème**: Mode E-Commerce demande Owner WhatsApp
**Solution**: Normal - requis pour e-commerce uniquement

**Problème**: Conversational mode essaie de vendre
**Solution**: Redémarrez bot avec mode correct sélectionné

---

**Version**: 2.0.0  
**Date**: December 9, 2025  
**Auteur**: APIWhatsapp Team

---

## ✨ Conclusion

Le bot est maintenant **UNIVERSEL** et peut être utilisé par:
- ✅ Médecins (conversation)
- ✅ Livreurs (tracking)
- ✅ Vendeurs (e-commerce)
- ✅ Services (rendez-vous)
- ✅ **TOUT LE MONDE!**

Plus de limitations - une solution pour tous! 🎉
