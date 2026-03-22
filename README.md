# Mitarbeiter Task System – Installationsanleitung

## Was ist im Paket?

Du hast ein komplettes System mit:
- **Server** (Node.js) mit Datenbank
- **Admin-Panel** – von überall steuerbar
- **Mitarbeiter-Terminal** – für das Tablet/PC im Büro

---

## Schritt 1: GitHub Account erstellen

1. Gehe zu **github.com** und erstelle einen kostenlosen Account
2. Klicke oben rechts auf **"+"** → **"New repository"**
3. Name: `task-system`
4. Auf **"Private"** stellen (wichtig!)
5. Klicke **"Create repository"**

## Schritt 2: Dateien hochladen

1. Entpacke die ZIP-Datei `mitarbeiter-task-system.zip` auf deinem Computer
2. Auf der GitHub-Seite deines neuen Repos klicke **"uploading an existing file"**
3. Ziehe ALLE entpackten Dateien rein:
   - `server.js`
   - `package.json`
   - `render.yaml`
   - `public/index.html` (den Ordner `public` mit der Datei drin)
4. Klicke **"Commit changes"**

## Schritt 3: Bei Render.com anmelden (KOSTENLOS)

1. Gehe zu **render.com**
2. Klicke **"Get Started for Free"**
3. Melde dich mit deinem **GitHub Account** an

## Schritt 4: App deployen

1. Auf dem Render Dashboard klicke **"New +"** → **"Web Service"**
2. Verbinde dein GitHub Repository `task-system`
3. Render erkennt die Einstellungen automatisch. Prüfe:
   - **Name:** `task-system`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Wähle den **Free** Plan
5. Unter **"Advanced"** → **"Add Environment Variable"**:
   - Key: `DB_PATH`
   - Value: `/opt/render/project/data/data.db`
6. Unter **"Disks"** klicke **"Add Disk"**:
   - Name: `task-data`
   - Mount Path: `/opt/render/project/data`
   - Size: `1 GB`
7. Klicke **"Create Web Service"**

**Warte 2-3 Minuten** bis der Build fertig ist.

## Schritt 5: Fertig! 🎉

Deine App läuft jetzt unter einer URL wie:
```
https://task-system-xxxx.onrender.com
```

### Admin-Login:
- **Passwort:** `admin123`
- ⚠️ **SOFORT ändern!** (Im System unter Einstellungen)

### Mitarbeiter-Login:
- Erstelle Mitarbeiter im Admin-Panel
- Jeder bekommt eine **4-stellige PIN**
- Das Tablet im Büro öffnet die gleiche URL

---

## Büro-Tablet einrichten

1. Öffne den Browser am Tablet/PC
2. Gehe zu deiner Render-URL
3. Wähle bei Login → **"Mitarbeiter"**
4. Optional: Setze die Seite als **Startseite** im Browser
5. Optional: Aktiviere den **Kiosk-Modus** (Vollbild, kein Zugriff auf andere Seiten)

### Kiosk-Modus (Chrome):
```
chrome.exe --kiosk https://task-system-xxxx.onrender.com
```

### Kiosk-Modus (Android Tablet):
- Installiere "Fully Kiosk Browser" aus dem Play Store
- Trage deine URL ein
- Das Tablet zeigt nur noch das Task System

---

## So funktioniert es

### Als Admin (du, von überall):
1. Öffne die URL im Browser
2. Login als Admin
3. **Mitarbeiter hinzufügen** → Name, Rolle, PIN, Sollstunden
4. **Aufgaben erstellen** → Titel, Mitarbeiter, Abzug, Deadline
5. Wenn Aufgabe nicht erledigt → **"Überfällig"** markieren → **"Abzug buchen"**
6. Alle Abzüge werden protokolliert

### Als Mitarbeiter (am Tablet im Büro):
1. PIN eingeben
2. Offene Aufgaben sehen
3. Aufgabe erledigt? → **Abhaken** ✓
4. Eigene Abzüge und effektive Stunden einsehen

---

## Wichtige Hinweise

- **Passwort sofort ändern** nach dem ersten Login
- **Render Free Plan:** App schläft nach 15 Min. Inaktivität ein, startet automatisch beim nächsten Aufruf (dauert ~30 Sek.)
- **Für immer-an:** Render Starter Plan für $7/Monat
- **Daten sind sicher:** Die Datenbank liegt auf Renders Server, nicht im Browser
- **Backup:** Du kannst jederzeit die Datenbank über Render herunterladen
