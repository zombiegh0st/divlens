# Pflichtenheft: DivLens

Lokale Depot-Auswertung als PWA. Kein Backend, alle Daten bleiben im Browser.

## 1. Ziele

- Depot-Exporte mehrerer Broker importieren und zusammenführen
- Entwicklung pro Position und gesamt darstellen
- Dividenden optional in die Entwicklung einrechnen
- Persönliche Dividenden pro Position und gesamt auswerten

### 1.1 Fokus und Nicht-Ziele

Spartanisch und minimalistisch. Die App zeigt genau drei Dinge:

1. Kursentwicklung (pro Position und gesamt)
2. Kursentwicklung inklusive Dividenden, per Toggle ein/aus
3. Persönliche Dividenden (pro Position und gesamt)

Nicht-Ziele (dafür gibt es andere Apps): Sektor-/Länder-Gewichtung, Steuerberichte, Rebalancing, Watchlists, Nachrichten, Multi-Broker in v1.0.

## 2. Rahmenbedingungen

| Punkt | Festlegung |
|---|---|
| Technik | Vanilla HTML/CSS/JS, ES Modules, keine Toolchain |
| Speicher | IndexedDB (lokal im Browser) |
| Betrieb | PWA, offlinefähig (Service Worker) |
| Backend | Keines |
| Kurse | Manuell, optional eigener API-Key (siehe 6) |
| Hosting | GitHub Pages, statisch, wartungsfrei |
| Quelltext | Englisch (Code, Kommentare, Namen) |
| Doku | Deutsch, Markdown |

## 3. Broker-Import

Unterstützt: Trade Republic, Scalable Capital, ING.

- Ein Parser pro Broker, einheitliche Schnittstelle:
  - `detect(file) -> boolean`
  - `parse(file) -> Transaction[]`
- Automatische Broker-Erkennung anhand des Dateiformats
- Importvorschau vor dem Speichern (Anzahl neu / Duplikate / Fehler)
- Parser-Fehler zeilenweise melden, nicht den ganzen Import abbrechen

### 3.0 Import-Modus

- **Hinzufügen** (Standard): neue Datensätze ergänzen, Duplikate überspringen
- **Neuanfang**: vorhandene Transaktionen vollständig löschen, danach importieren
  - Bestätigungsdialog mit Anzahl der zu löschenden Datensätze
  - Automatisches JSON-Backup vor dem Löschen (Download), falls gewünscht
  - Kurs-Cache und Einstellungen bleiben erhalten

### 3.1 Einheitliches Transaktionsmodell

| Feld | Beschreibung |
|---|---|
| `id` | Hash (siehe Dedup) |
| `broker` | `tr` / `scalable` / `ing` |
| `date` | Ausführungsdatum |
| `type` | `buy`, `sell`, `dividend`, `fee`, `tax`, `transfer_in`, `transfer_out`, `split` |
| `isin` | ISIN |
| `name` | Bezeichnung |
| `quantity` | Stückzahl |
| `amount` | Betrag brutto |
| `fee` | Gebühren |
| `tax` | Steuern (inkl. Quellensteuer) |
| `currency` | Währung |
| `source` | Importdatei / Importzeitpunkt |

### 3.2 Deduplizierung

- Hash aus `broker + date + type + isin + quantity + amount`
- Falls der Export eine Order-/Referenz-ID liefert: diese bevorzugen
- Gleiche Orders am selben Tag (identischer Hash): Zähler-Suffix, damit echte Doppel-Orders nicht verloren gehen
- Re-Import derselben Datei erzeugt 0 neue Datensätze
- Überlappende Exporte werden zusammengeführt

### 3.3 Trade Republic CSV (Befund aus echtem Export)

| Feld | Verwendung |
|---|---|
| `transaction_id` | Dedup-Schlüssel (UUID), kein Hash nötig |
| `date`, `type` | `BUY`, `SELL`, `DIVIDEND` relevant; `TRANSFER_*` in v1.0 ignoriert |
| `symbol` | enthält die ISIN |
| `shares` | bei `SELL` negativ; bei `DIVIDEND` = Bestand zur Zahlung |
| `amount` | bei Kauf/Verkauf ohne Gebühr; bei Dividende **brutto** |
| `fee` | separat (negativ); Einstand = Betrag + Gebühr |
| `tax` | bei Dividende separat (negativ); Netto = `amount` + `tax` |
| `original_amount`, `original_currency`, `fx_rate` | Fremdwährungsdividende (z. B. USD) |

- Personenbezogene Felder (`description`, `counterparty_*`, IBAN) werden ignoriert und nicht gespeichert
- Zeilen mit unbekanntem `type` werden gemeldet, nicht verworfen

## 4. Auswertungen

### 4.1 Entwicklung

Alles bezieht sich auf den **investierten Betrag**. Keine FIFO-Logik und kein XIRR in v1.0.

| Größe | Definition |
|---|---|
| I (Investiert) | Summe aller Käufe einer Position inkl. Gebühren |
| E (Erlös) | Summe aller Verkäufe abzüglich Gebühren |
| W (Wert) | aktueller Kurs × Bestand |
| D (Dividenden) | erhalten, netto (Standard) oder brutto |
| Kursergebnis | W + E − I |
| Gesamtergebnis | Kursergebnis + D |
| Performance % | Ergebnis ÷ I |
| Dividendenquote | D ÷ I |

- Anzeige in € und %, pro Position und gesamt
- **Toggle „Dividenden einrechnen"**: schaltet D in Gesamtergebnis und Performance ein/aus; D bleibt separat immer sichtbar
- Ohne eingetragenen Kurs entfällt W; Dividendenquote und realisiertes Ergebnis bleiben berechenbar
- Geschlossene Positionen (Bestand 0) per Schalter ein-/ausblendbar; ihre Dividenden zählen in die Gesamtsumme
- Verlauf: Wert-Snapshots (siehe Abschnitt 6), im Chart als Lücken erkennbar, wenn die App länger nicht geöffnet wurde
- Spätere Erweiterungen: XIRR, Zeitraumfilter

### 4.2 Dividenden

- Erhalten pro Position und gesamt, brutto/netto umschaltbar
- Aggregation: Monat, Quartal, Jahr
- Yield-on-Cost pro Position und gesamt
- Dividendenwachstum pro Position (Jahr über Jahr)
- Quellensteuer separat ausweisbar

### 4.3 Weitere Ansichten (Phase 2)

- Gewichtung nach Position, Land, Sektor
- Dividendenkalender (erwartete Zahlungen)
- Freistellungsauftrag-Auslastung
- Kosten (Gebühren/Steuern) über die Zeit

## 5. Depotübertrag

- Übertrag (z. B. Trade Republic nach Scalable Capital) wird als `transfer_out` / `transfer_in` erkannt
- Einstandskurse und Kaufdatum bleiben erhalten
- Manuelle Verknüpfung möglich, falls die automatische Zuordnung scheitert
- Performance darf durch den Übertrag nicht verfälscht werden

## 6. Kursdaten

Grundsatz: kein Server, keine Pflege. Die App muss ohne jeden Kursdienst nutzbar sein.

- **Ohne Kursdienst:** Einstand, Dividenden (netto/brutto), realisierte Gewinne, Performance inkl. Dividenden
- **Manueller Kurs** pro Position (Standard, immer verfügbar)
- **Optional: eigener API-Key (BYOK)**, lokal im Browser gespeichert, nie exportiert:
  - [Twelve Data](https://twelvedata.com)
  - [Finnhub](https://finnhub.io)
  - [Alpha Vantage](https://www.alphavantage.co)
- Kursanbieter hinter Schnittstelle `getQuote(isin)`, damit Anbieter austauschbar sind
- Mapping ISIN → Ticker manuell editierbar
- **Kursverlauf per Snapshots:** Bei jedem Öffnen/Aktualisieren wird ein Wert-Snapshot lokal gespeichert. Historie wächst ab erster Nutzung; rückwirkende Historie nur mit Kursdienst.
- Kein Yahoo-Proxy, keine fremden CORS-Proxys

**Offener Punkt:** Free-Tiers der Anbieter auf Abdeckung (z. B. Xetra) prüfen.

## 7. Datensicherung

- Export/Import der gesamten Datenbank als JSON
- Hinweis zur regelmäßigen Sicherung (Browser-Daten können gelöscht werden)
- `navigator.storage.persist()` anfordern

## 8. UI

- Responsive, Mobile-first (PWA-Installation)
- Dark/Light nach Systemeinstellung
- Charts: [uPlot](https://github.com/leeoniya/uPlot) (leicht, schnell) oder [Chart.js](https://www.chartjs.org) (einfacher)
- Hauptseiten: Übersicht, Positionen, Dividenden, Transaktionen, Import, Einstellungen

## 9. Nicht-funktionale Anforderungen

- Läuft offline nach der ersten Installation
- Kein Datenabfluss außer Kursabfragen (nur Symbole, keine Depotdaten)
- Import von 10.000 Transaktionen unter 5 Sekunden
- Parser mit Testdateien pro Broker abgesichert

## 10. Meilensteine

| Phase | Inhalt |
|---|---|
| v1.0 | Trade Republic Import, Dedup, Neuanfang-Modus, Kursentwicklung, Toggle inkl./ohne Dividenden, persönliche Dividenden, Backup |
| Backlog | Scalable Capital, ING, Depotübertrag, XIRR, Yield-on-Cost, Dividendenkalender |

## 11. Offene Fragen

- Beispiel-Exporte der drei Broker (anonymisiert) für die Parser
- Kursanbieter (siehe Abschnitt 6)
- Umgang mit Splits, Spin-offs und Thesaurierern
- Mehrwährung: Umrechnung in EUR, Wechselkursquelle
