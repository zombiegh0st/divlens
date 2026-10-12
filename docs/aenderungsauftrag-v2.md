# Änderungsauftrag v2: Graph-Übersicht (DivLens)

Ergänzt und ersetzt, wo es kollidiert, `docs/pflichtenheft.md` (Abschnitte 1.1, 4, 6, 8, 10) und den Abschnitt „Scope v1.0" / „Prices" in `CLAUDE.md`. Bei Widerspruch gilt dieses Dokument. `CLAUDE.md` danach entsprechend anpassen.

## 1. Anlass

v1 zeigt Kennzahlen und Tabellen. Gewünscht ist eine App wie die Depot-Ansicht von Trade Republic oder Scalable: **ein Graph**, optional inklusive erhaltener Dividenden, darunter die Positionen, per Klick die Detailansicht einer Position. Mehr nicht.

Bleibt unverändert: Parser, Dedup, Datenbank, Import (Hinzufügen/Neuanfang), Backup, Dividenden- und Umsatzliste.

## 2. Zielbild

### 2.1 Übersicht (Startseite)

```
DivLens
  Gesamtergebnis  +xx,xx €  (+x,x %)
  [ Graph: Depotverlauf, mit Finger/Maus verschiebbarer Marker ]
  1W  1M  3M  YTD  1J  Max

  [x] Dividenden einrechnen    [ ] brutto
  [ ] Dividendenrendite anzeigen

  Positionen
  > Main Street Capital      Wert     Ergebnis € / %
  > Ares Capital             ...
```

- **Graph:** Marktwert aller Positionen über die Zeit. Ist „Dividenden einrechnen" an, zeigt die Linie Wert + kumulierte Dividenden.
- **Netto/Brutto:** wirkt nur, wenn Dividenden eingerechnet werden. Standard netto.
- **Dividendenrendite (persönlich):** erhaltene Dividenden ÷ investierter Betrag, in %. Als Option in Übersicht und Detail ein-/ausblendbar.
- **Positionsliste:** Name, aktueller Wert, Ergebnis in € und %. Sortiert nach Wert. Geschlossene Positionen per Schalter.
- **Zeitraum-Chips** wirken auf Graph und Kopfzahl.
- **Navigation:** Übersicht ist die Startseite. Dividenden, Umsätze, Import und Daten rücken in ein Menü.

### 2.2 Positions-Detail (Klick auf Position)

- Gleicher Graph, nur diese Position, gleiche Zeiträume und gleiche Optionen (Dividenden einrechnen, brutto/netto, Dividendenrendite)
- Kennzahlen: Bestand, Ø Kaufkurs, aktueller Wert, Ergebnis € / %, Dividenden erhalten, Dividendenrendite
- Liste der Dividenden dieser Position (Datum, Betrag)
- Liste der Käufe/Verkäufe dieser Position

### 2.3 Rechenregeln

| Größe | Definition |
|---|---|
| Wert(t) | Bestand(t) × Schlusskurs(t), in EUR |
| Kum. Dividenden(t) | Summe aller Dividenden bis t (netto oder brutto) |
| Ergebnis (Max) | Wert + Verkaufserlöse + Dividenden − Investiert |
| Prozent (Max) | Ergebnis ÷ Investiert |
| Ergebnis (Zeitraum) | Wert(Ende) − Wert(Start) − Käufe + Verkäufe im Zeitraum (+ Dividenden im Zeitraum, falls an) |
| Prozent (Zeitraum) | Ergebnis ÷ (Wert(Start) + Käufe im Zeitraum) |

- Zeitraum-Prozent ist bewusst vereinfacht (kein XIRR). Die Formel mit einem Test festhalten.
- Fremdwährung: Kurse in USD werden mit dem EUR/USD-Tageskurs umgerechnet. Der Währungseffekt steckt im Ergebnis, wie bei TR.
- Käufe: Betrag inkl. Gebühr, Verkäufe: Betrag abzüglich Gebühr (wie bisher).

## 3. Kurshistorie

Ohne Kurshistorie gibt es keinen Graph. Daher:

- **Tägliche Schlusskurse** pro Position und EUR/USD in IndexedDB cachen, nur fehlende Tage nachladen, höchstens einmal täglich abfragen.
- **Anbieter hinter Schnittstelle** `getDailyHistory(symbol, from, to)`:
  - Erste Wahl: [Twelve Data](https://twelvedata.com), Free-Plan laut Drittquellen 800 Aufrufe/Tag und 8/Minute (ungeprüft)
  - Möglich später: [Alpha Vantage](https://www.alphavantage.co), Free-Plan 25 Aufrufe/Tag, volle Historie evtl. nicht kostenlos (ungeprüft)
  - Entfällt: Finnhub (Candle-Endpoint laut Finnhub nicht im Free-Plan)
- **Eigener API-Key (BYOK):** nur lokal gespeichert, nie exportiert, nie geloggt. Kein Server, kein Proxy.
- **Symbol-Zuordnung:** ISIN → Symbol im Bereich „Daten" editierbar, mit Vorschlag über die Symbolsuche des Anbieters. Erwartete Symbole der aktuellen Positionen: MAIN, ARCC, HTGC, CSWC (US) und MUV2 (Xetra).
- **Fallback ohne Key oder ohne Kurse einer Position:**
  - Graph aus Transaktionen: „Investiert" als Stufenlinie plus kumulierte Dividenden
  - Hinweis im UI: „Keine Kurshistorie, Marktwert nicht verfügbar"
  - Manueller aktueller Kurs bleibt möglich
- Rate-Limit beachten: Abfragen bündeln, Fortschritt anzeigen, bei Limit-Fehler sauber abbrechen und beim nächsten Öffnen fortsetzen.
- Keine Yahoo-Endpunkte, keine fremden CORS-Proxys.

## 4. Meilenstein 0: Spike (zuerst, bevor die UI gebaut wird)

Eine Wegwerf-Testseite `spike/index.html`, nicht Teil der App:

- Key eingeben, dann Tageskurse seit 2026-03-01 für MAIN, ARCC, HTGC, CSWC, MUV2 (Xetra) und EUR/USD direkt aus dem Browser abrufen
- Pro Symbol ausgeben: Erfolg oder Fehlertext, CORS-Fehler ja/nein, Anzahl Datenpunkte, ältester Tag, verbrauchte Credits
- Ergebnis entscheidet über Anbieter und Fallback. Besonders offen: Ist Xetra (Münchener Rück) im Free-Plan enthalten?

## 5. Reihenfolge

| Schritt | Inhalt |
|---|---|
| 0 | Spike (siehe 4), Ergebnis an Alex melden |
| 1 | Datenschicht: Kurshistorie-Cache, Tageswerte aus Transaktionen, Rechenregeln mit Tests |
| 2 | Übersicht mit Graph, Zeitraum-Chips, Optionen |
| 3 | Positions-Detail |
| 4 | Fallback ohne Kurse |
| 5 | Navigation aufräumen, bestehende Tabs ins Menü |

## 6. Graph-Umsetzung

- Mobile-first, Finger/Maus über den Graph zeigt Datum und Wert (wie TR)
- Bevorzugt eigener SVG-Linienchart ohne Abhängigkeit, wenn er klein bleibt (grob unter 150 Zeilen). Sonst [uPlot](https://github.com/leeoniya/uPlot), lokal im Repo (kein CDN). Vor dem Hinzufügen kurz nachfragen.
- Dunkles und helles Theme nach Systemeinstellung (bleibt)

## 7. Abnahme

- Mit `test/fixtures/tr-export.csv` zeigt der Graph einen Verlauf ab 23.03.2026
- „Dividenden einrechnen" verändert die Linie sichtbar, brutto/netto ebenso
- Klick auf eine Position öffnet den Graph nur dieser Position
- Ohne Key erscheint der Fallback mit Hinweis statt „Kurs fehlt"
- Rechenregeln aus 2.3 sind durch Tests abgedeckt

## 8. Offene Punkte

- Xetra-Abdeckung im Free-Plan (Spike)
- Ob Twelve Data Browser-Zugriff (CORS) mit Key erlaubt (Spike)
- Dividendenrendite annualisieren: Backlog
