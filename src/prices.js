// Price access behind getQuote(isin). v1.0 uses manually entered prices only;
// API providers can be added here later without touching the UI.

import { getAll, put, remove } from './db.js';

// Returns { price: cents, date } or null.
export async function getQuote(isin) {
  return (await getPrices())[isin] || null;
}

export async function getPrices() {
  const rows = await getAll('prices');
  return Object.fromEntries(rows.map((r) => [r.isin, r]));
}

export function setManualPrice(isin, price, date) {
  return put('prices', { isin, price, date, source: 'manual' });
}

export const removePrice = (isin) => remove('prices', isin);
