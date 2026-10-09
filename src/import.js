// Broker detection and import planning (pure, no storage access).

import * as tr from './parsers/tr.js';

const PARSERS = [tr];

export function findParser(text) {
  return PARSERS.find((p) => p.detect(text)) || null;
}

// Splits parsed transactions into new ones and duplicates.
// Duplicates are ids already stored or repeated within the same file.
export function planImport(transactions, existingIds = new Set()) {
  const seen = new Set(existingIds);
  const fresh = [];
  let duplicates = 0;
  for (const tx of transactions) {
    if (seen.has(tx.id)) { duplicates++; continue; }
    seen.add(tx.id);
    fresh.push(tx);
  }
  return { fresh, duplicates };
}
