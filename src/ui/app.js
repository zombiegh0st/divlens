import * as db from '../db.js';
import { getPrices, setManualPrice, removePrice } from '../prices.js';
import { findParser, planImport } from '../import.js';
import { computePositions, computeTotals, dividendsByPeriod } from '../metrics.js';
import { toCents } from '../csv.js';
import { lineChart } from './chart.js';

const BACKUP_REMINDER_DAYS = 30;
const DEFAULTS = { dividends: 'net', includeDividends: true, showClosed: false, period: 'month' };
const TYPE_LABELS = { buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende' };

const view = document.getElementById('view');
const state = { transactions: [], prices: {}, snapshots: [], settings: {}, persisted: null, pending: null, message: '', open: new Set() };
const opts = () => ({ ...DEFAULTS, ...state.settings });

// Formatting
const eurFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const pctFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sharesFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 });
const sign = (v) => (v > 0 ? '+' : '');
const eur = (c) => (c === null ? '–' : eurFormat.format(c / 100));
const signedEur = (c) => (c === null ? '–' : sign(c) + eur(c));
const pct = (r) => (r === null ? '–' : `${pctFormat.format(r * 100)} %`);
const signedPct = (r) => (r === null ? '–' : sign(r) + pct(r));
const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dividendLabel = () => (opts().dividends === 'gross' ? 'brutto' : 'netto');

function today() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Data

async function load() {
  [state.transactions, state.prices, state.snapshots, state.settings] = await Promise.all([
    db.getAll('transactions'),
    getPrices(),
    db.getAll('snapshots'),
    db.getSettings(),
  ]);
}

async function saveSetting(key, value) {
  state.settings[key] = value;
  await db.setSetting(key, value);
}

// Stores today's value snapshot. Only complete snapshots (all prices known) are kept.
async function snapshot() {
  const t = computeTotals(computePositions(state.transactions, state.prices));
  if (!state.transactions.length || t.value === null) return;
  const snap = { date: today(), value: t.value, invested: t.invested, proceeds: t.proceeds, dividendsNet: t.dividendsNet, dividendsGross: t.dividendsGross };
  await db.put('snapshots', snap);
  state.snapshots = [...state.snapshots.filter((s) => s.date !== snap.date), snap].sort((a, b) => a.date.localeCompare(b.date));
}

async function downloadBackup() {
  const data = await db.exportBackup();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `divlens-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  await saveSetting('lastBackup', today());
}

// Views

function toggles(...keys) {
  const o = opts();
  const items = {
    includeDividends: `<label><input type="checkbox" data-setting="includeDividends" ${o.includeDividends ? 'checked' : ''}> Dividenden einrechnen</label>`,
    gross: `<label><input type="checkbox" data-setting="dividends" data-on="gross" data-off="net" ${o.dividends === 'gross' ? 'checked' : ''}> Dividenden brutto</label>`,
    showClosed: `<label><input type="checkbox" data-setting="showClosed" ${o.showClosed ? 'checked' : ''}> Geschlossene zeigen</label>`,
  };
  return `<div class="toggles">${keys.map((k) => items[k]).join('')}</div>`;
}

function backupReminder() {
  const last = state.settings.lastBackup;
  if (last && (Date.parse(today()) - Date.parse(last)) / 86400000 < BACKUP_REMINDER_DAYS) return '';
  return `<p class="notice">Letztes Backup: ${last ? fmtDate(last) : 'noch nie'}. Browser-Daten können verloren gehen. <a href="#settings">Jetzt sichern</a></p>`;
}

function overview() {
  if (!state.transactions.length) {
    return '<p>Noch keine Daten.</p><p><a href="#import">Trade-Republic-Export importieren</a></p>';
  }
  const o = opts();
  const positions = computePositions(state.transactions, state.prices, o);
  const t = computeTotals(positions, o);
  const visible = positions
    .filter((p) => p.hasTrades && (o.showClosed || !p.closed))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const points = state.snapshots.map((s) => ({
    date: s.date,
    value: s.value + s.proceeds - s.invested + (o.includeDividends ? (o.dividends === 'gross' ? s.dividendsGross : s.dividendsNet) : 0),
  }));
  const chart = lineChart(points, eur, fmtDate);

  return `${backupReminder()}
    ${toggles('includeDividends', 'gross', 'showClosed')}
    <p class="muted">Gesamtergebnis ${o.includeDividends ? 'inkl.' : 'ohne'} Dividenden</p>
    <p class="big ${cls(t.result)}">${t.result === null ? '–' : `${signedEur(t.result)} <small>${signedPct(t.performance)}</small>`}</p>
    ${t.missingPrices ? `<p class="notice">Kurs fehlt für ${t.missingPrices} Position${t.missingPrices > 1 ? 'en' : ''}. Kurs bei der Position eintragen.</p>` : ''}
    <dl>
      <dt>Investiert</dt><dd>${eur(t.invested)}</dd>
      <dt>Aktueller Wert</dt><dd>${eur(t.value)}</dd>
      <dt>Verkaufserlöse</dt><dd>${eur(t.proceeds)}</dd>
      <dt>Kursergebnis</dt><dd class="${cls(t.priceResult)}">${signedEur(t.priceResult)}</dd>
      <dt>Realisiert (geschlossen)</dt><dd class="${cls(t.realized)}">${signedEur(t.realized)}</dd>
      <dt>Dividenden ${dividendLabel()}</dt><dd>${eur(t.dividends)}</dd>
      <dt>Dividendenquote</dt><dd>${pct(t.dividendQuota)}</dd>
    </dl>
    ${chart ? `<h2>Verlauf</h2>${chart}<p class="muted">Lücken: App in dieser Zeit nicht geöffnet.</p>` : ''}
    <h2>Positionen</h2>
    ${visible.map(position).join('') || '<p class="muted">Keine offenen Positionen.</p>'}`;
}

function position(p) {
  const price = p.price === null ? '' : (p.price / 100).toFixed(2).replace('.', ',');
  const head = p.value === null
    ? '<span class="muted">Kurs fehlt</span>'
    : `<span class="${cls(p.result)}">${signedEur(p.result)}</span><br><small>${signedPct(p.performance)}</small>`;
  return `<details data-isin="${esc(p.isin)}" ${state.open.has(p.isin) ? 'open' : ''}>
    <summary><span class="name">${esc(p.name)}</span><span class="num">${head}</span></summary>
    <div>
      <dl>
        <dt>ISIN</dt><dd>${esc(p.isin)}</dd>
        <dt>Stück</dt><dd>${sharesFormat.format(p.shares)}</dd>
        <dt>Investiert</dt><dd>${eur(p.invested)}</dd>
        <dt>Verkaufserlöse</dt><dd>${eur(p.proceeds)}</dd>
        <dt>Wert</dt><dd>${eur(p.value)}</dd>
        <dt>Kursergebnis</dt><dd class="${cls(p.priceResult)}">${signedEur(p.priceResult)}</dd>
        <dt>Dividenden ${dividendLabel()}</dt><dd>${eur(p.dividends)}</dd>
        <dt>Dividendenquote</dt><dd>${pct(p.dividendQuota)}</dd>
      </dl>
      ${p.closed ? '<p class="muted">Position geschlossen.</p>' : `
      <form class="row" data-isin="${esc(p.isin)}">
        <input type="text" name="price" inputmode="decimal" size="10" placeholder="Kurs in €" value="${price}">
        <button>Kurs speichern</button>
        ${p.priceDate ? `<span class="muted">Stand ${fmtDate(p.priceDate)}</span>` : ''}
      </form>`}
    </div>
  </details>`;
}

function dividends() {
  const o = opts();
  const divs = state.transactions.filter((t) => t.type === 'dividend');
  if (!divs.length) return '<p>Noch keine Dividenden.</p>';
  const key = o.dividends === 'gross' ? 'gross' : 'net';
  const t = computeTotals(computePositions(state.transactions, state.prices, o), o);
  const periods = dividendsByPeriod(divs, o.period);
  const positions = computePositions(divs, {}, o).sort((a, b) => b.dividends - a.dividends);
  const label = (p) => (o.period === 'month' ? `${p.slice(5)}/${p.slice(0, 4)}` : o.period === 'quarter' ? `${p.slice(5)} ${p.slice(0, 4)}` : p);
  const quota = Object.fromEntries(computePositions(state.transactions, {}, o).map((p) => [p.isin, p.dividendQuota]));

  return `${toggles('gross')}
    <p class="muted">Erhalten ${dividendLabel()}</p>
    <p class="big">${eur(t.dividends)}</p>
    <dl>
      <dt>Brutto</dt><dd>${eur(t.dividendsGross)}</dd>
      <dt>Steuern</dt><dd>${eur(t.dividendTax)}</dd>
      <dt>Netto</dt><dd>${eur(t.dividendsNet)}</dd>
      <dt>Dividendenquote</dt><dd>${pct(t.dividendQuota)}</dd>
    </dl>
    <h2>Nach Zeitraum</h2>
    <select data-setting="period">
      ${[['month', 'Monat'], ['quarter', 'Quartal'], ['year', 'Jahr']].map(([v, l]) => `<option value="${v}" ${o.period === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <table>
      <tr><th>Zeitraum</th><th class="num">Betrag</th><th class="num">Steuer</th></tr>
      ${periods.map((r) => `<tr><td>${label(r.period)}</td><td class="num">${eur(r[key])}</td><td class="num">${eur(r.tax)}</td></tr>`).join('')}
    </table>
    <h2>Nach Position</h2>
    <table>
      <tr><th>Position</th><th class="num">Betrag</th><th class="num">Quote</th></tr>
      ${positions.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${eur(p.dividends)}</td><td class="num">${pct(quota[p.isin])}</td></tr>`).join('')}
    </table>`;
}

function transactions() {
  if (!state.transactions.length) return '<p>Noch keine Umsätze.</p>';
  const rows = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  return `<p class="muted">${rows.length} Transaktionen</p>
    <table>
      <tr><th>Datum</th><th>Art</th><th>Name</th><th class="num">Stück</th><th class="num">Betrag</th></tr>
      ${rows.map((t) => `<tr>
        <td>${fmtDate(t.date)}</td>
        <td>${TYPE_LABELS[t.type] || `<span class="neg">${esc(t.rawType)}</span>`}</td>
        <td>${esc(t.name)}</td>
        <td class="num">${t.shares ? sharesFormat.format(t.shares) : ''}</td>
        <td class="num ${cls(t.amount + (t.fee || 0) + (t.tax || 0))}">${eur(t.amount + (t.fee || 0) + (t.tax || 0))}</td>
      </tr>`).join('')}
    </table>`;
}

function importView() {
  let html = `<p>Trade-Republic-Export (CSV) auswählen. Die Datei wird nur lokal im Browser gelesen.</p>
    <input type="file" accept=".csv,text/csv" data-action="pick">`;
  const p = state.pending;
  if (!p) return html;

  const existing = new Set(state.transactions.map((t) => t.id));
  const { fresh, duplicates } = planImport(p.result.transactions, p.mode === 'fresh' ? new Set() : existing);
  const unknown = {};
  for (const t of fresh) if (t.type === 'unknown') unknown[t.rawType] = (unknown[t.rawType] || 0) + 1;
  const unknownCount = Object.values(unknown).reduce((a, b) => a + b, 0);
  const { errors, ignored } = p.result;

  html += `<h2>Vorschau: ${esc(p.fileName)} (${esc(p.label)})</h2>
    <dl>
      <dt>Neu</dt><dd>${fresh.length}</dd>
      <dt>Duplikate</dt><dd>${duplicates}</dd>
      <dt>Fehler</dt><dd class="${errors.length ? 'neg' : ''}">${errors.length}</dd>
      <dt>Ignoriert (Überträge)</dt><dd>${ignored}</dd>
    </dl>
    ${unknownCount ? `<p class="notice">${unknownCount} Zeilen mit unbekanntem Typ werden gespeichert, aber nicht ausgewertet: ${Object.entries(unknown).map(([k, n]) => `${esc(k)} (${n})`).join(', ')}</p>` : ''}
    ${errors.length ? `<details><summary>Fehler anzeigen</summary><ul>${errors.map((e) => `<li>Zeile ${e.line}: ${esc(e.message)}</li>`).join('')}</ul></details>` : ''}
    <h2>Modus</h2>
    <label><input type="radio" name="mode" value="add" ${p.mode === 'add' ? 'checked' : ''}> Hinzufügen (Duplikate überspringen)</label><br>
    <label><input type="radio" name="mode" value="fresh" ${p.mode === 'fresh' ? 'checked' : ''}> Neuanfang (${existing.size} vorhandene Transaktionen löschen)</label>
    <div class="row">
      <button class="primary" data-action="import" ${fresh.length ? '' : 'disabled'}>Importieren</button>
      <button data-action="cancel-import">Abbrechen</button>
    </div>`;
  return html;
}

function settings() {
  const last = state.settings.lastBackup;
  const persisted = state.persisted === null ? 'unbekannt' : state.persisted ? 'ja' : 'nein (Browser kann Daten löschen)';
  return `<h2>Backup</h2>
    <p class="muted">Letztes Backup: ${last ? fmtDate(last) : 'noch nie'}. Das Backup enthält Transaktionen, Kurse, Verlauf und Einstellungen.</p>
    <div class="row">
      <button data-action="backup">Backup exportieren</button>
      <button data-action="restore-pick">Backup importieren</button>
      <input type="file" accept=".json,application/json" data-action="restore" hidden>
    </div>
    <h2>Speicher</h2>
    <dl>
      <dt>Transaktionen</dt><dd>${state.transactions.length}</dd>
      <dt>Kurse</dt><dd>${Object.keys(state.prices).length}</dd>
      <dt>Verlaufspunkte</dt><dd>${state.snapshots.length}</dd>
      <dt>Dauerhafter Speicher</dt><dd>${persisted}</dd>
    </dl>
    <p class="muted">Alle Daten bleiben lokal in diesem Browser. Es wird nichts hochgeladen.</p>`;
}

const ROUTES = { overview, dividends, transactions, import: importView, settings };

function render() {
  const route = location.hash.slice(1) in ROUTES ? location.hash.slice(1) : 'overview';
  for (const a of document.querySelectorAll('nav a')) a.classList.toggle('active', a.hash === `#${route}`);
  const message = state.message ? `<p class="notice">${esc(state.message)}</p>` : '';
  state.message = '';
  view.innerHTML = message + ROUTES[route]();
}

// Actions

// Renders the route; a hash change renders via the hashchange listener.
function navigate(route) {
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}

async function pickFile(file) {
  const text = await file.text();
  const parser = findParser(text);
  state.pending = parser ? { fileName: file.name, label: parser.label, result: parser.parse(text), mode: 'add' } : null;
  if (!parser) state.message = 'Dateiformat nicht erkannt. Unterstützt wird der Trade-Republic-CSV-Export.';
  render();
}

async function runImport() {
  const { result, mode, fileName } = state.pending;
  const existing = new Set(state.transactions.map((t) => t.id));
  const { fresh } = planImport(result.transactions, mode === 'fresh' ? new Set() : existing);
  const source = { file: fileName, importedAt: new Date().toISOString() };
  const records = fresh.map((t) => ({ ...t, source }));

  if (mode === 'fresh') {
    if (existing.size) {
      const dialog = document.getElementById('fresh-dialog');
      document.getElementById('fresh-count').textContent = existing.size;
      dialog.returnValue = '';
      dialog.showModal();
      await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
      if (dialog.returnValue !== 'ok') return;
      if (document.getElementById('fresh-backup').checked) await downloadBackup();
    }
    await db.replaceTransactions(records);
  } else {
    await db.putMany('transactions', records);
  }

  state.pending = null;
  await load();
  await snapshot();
  state.message = `${records.length} Transaktionen importiert.`;
  navigate('overview');
}

async function savePrice(form) {
  const isin = form.dataset.isin;
  const input = form.elements.price.value.trim().replace(/\s/g, '');
  if (input === '') {
    await removePrice(isin);
  } else {
    let cents;
    try {
      cents = toCents(input.includes(',') ? input.replace(/\./g, '').replace(',', '.') : input);
    } catch {
      cents = -1;
    }
    if (cents <= 0) { alert('Bitte einen gültigen Kurs eingeben, z. B. 45,62'); return; }
    await setManualPrice(isin, cents, today());
  }
  state.prices = await getPrices();
  await snapshot();
  render();
}

async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    const when = data.exportedAt ? fmtDate(data.exportedAt.slice(0, 10)) : 'unbekannt';
    if (!confirm(`Backup vom ${when} einspielen? Alle aktuellen Daten werden ersetzt.`)) return;
    await db.restoreBackup(data);
    await load();
    state.message = 'Backup eingespielt.';
  } catch (err) {
    state.message = `Backup konnte nicht gelesen werden: ${err.message}`;
  }
  render();
}

view.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.setting) {
    const value = el.type !== 'checkbox' ? el.value : el.dataset.on ? (el.checked ? el.dataset.on : el.dataset.off) : el.checked;
    await saveSetting(el.dataset.setting, value);
    render();
  } else if (el.dataset.action === 'pick' && el.files[0]) {
    pickFile(el.files[0]);
  } else if (el.dataset.action === 'restore' && el.files[0]) {
    restore(el.files[0]);
  } else if (el.name === 'mode') {
    state.pending.mode = el.value;
    render();
  }
});

view.addEventListener('click', async (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'import') runImport();
  else if (action === 'cancel-import') { state.pending = null; render(); }
  else if (action === 'backup') { await downloadBackup(); render(); }
  else if (action === 'restore-pick') view.querySelector('[data-action="restore"]').click();
});

view.addEventListener('submit', (e) => {
  e.preventDefault();
  savePrice(e.target);
});

// Remember which positions are expanded across re-renders.
view.addEventListener('toggle', (e) => {
  const isin = e.target.dataset?.isin;
  if (isin) e.target.open ? state.open.add(isin) : state.open.delete(isin);
}, true);

async function init() {
  await load();
  if (!state.settings.persistRequested && navigator.storage?.persist) {
    await navigator.storage.persist();
    await saveSetting('persistRequested', true);
  }
  state.persisted = (await navigator.storage?.persisted?.()) ?? null;
  await snapshot();
  render();
  addEventListener('hashchange', render);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

init();
