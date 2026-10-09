// Trade Republic CSV parser.
// Interface shared by all broker parsers: detect(text) -> boolean, parse(text) -> result.

import { parseCsv, toCents } from '../csv.js';

const REQUIRED = ['transaction_id', 'date', 'type', 'symbol', 'shares', 'amount', 'fee', 'tax', 'currency'];
const TYPES = { BUY: 'buy', SELL: 'sell', DIVIDEND: 'dividend' };

export const id = 'tr';
export const label = 'Trade Republic';

export function detect(text) {
  const header = parseCsv(text.slice(0, 2000))[0]?.fields || [];
  return REQUIRED.every((name) => header.includes(name));
}

// Returns { transactions, ignored, errors }.
// Unknown types are kept as type 'unknown' so the UI can report them.
// Personal fields (description, counterparty_*, payment_reference) are never read.
export function parse(text, { source = '' } = {}) {
  const rows = parseCsv(text);
  const header = rows.shift()?.fields || [];
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  const transactions = [];
  const errors = [];
  let ignored = 0;

  for (const { line, fields } of rows) {
    if (fields.length === 1 && fields[0] === '') continue;
    try {
      const get = (name) => (fields[col[name]] ?? '').trim();
      const tx = toTransaction(get, source);
      if (tx) transactions.push(tx);
      else ignored++;
    } catch (err) {
      errors.push({ line, message: err.message });
    }
  }
  return { transactions, ignored, errors };
}

function toTransaction(get, source) {
  const id = get('transaction_id');
  const date = get('date');
  const rawType = get('type');
  if (!id) throw new Error('transaction_id fehlt');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Ungültiges Datum "${date}"`);
  if (rawType.startsWith('TRANSFER_')) return null;

  const base = { id, broker: 'tr', date, isin: get('symbol'), name: get('name'), source };
  const type = TYPES[rawType];
  if (!type) {
    return { ...base, type: 'unknown', rawType, amount: toCents(get('amount')), currency: get('currency') };
  }

  if (!base.isin) throw new Error(`ISIN fehlt (${rawType})`);
  const currency = get('currency');
  if (currency !== 'EUR') throw new Error(`Währung "${currency}" nicht unterstützt`);
  const shares = Number(get('shares'));
  if (!Number.isFinite(shares)) throw new Error(`Ungültige Stückzahl "${get('shares')}"`);
  if (type !== 'dividend' && shares === 0) throw new Error('Stückzahl ist 0');

  const tx = {
    ...base,
    type,
    shares,
    amount: toCents(get('amount')),
    fee: toCents(get('fee')),
    tax: toCents(get('tax')),
    currency,
  };
  if (type === 'dividend' && get('original_currency')) {
    tx.originalAmount = toCents(get('original_amount'));
    tx.originalCurrency = get('original_currency');
    tx.fxRate = Number(get('fx_rate')) || null;
  }
  return tx;
}
