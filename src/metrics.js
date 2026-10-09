// Performance metrics. All money values are integer cents.
// I = invested (buys incl. fees), E = proceeds (sells minus fees), W = value, D = dividends.

const roundShares = (n) => Math.round(n * 1e8) / 1e8;

// prices: { [isin]: { price: cents, date } }
// opts: { dividends: 'net' | 'gross', includeDividends: boolean }
export function computePositions(transactions, prices = {}, opts = {}) {
  const map = new Map();
  for (const tx of transactions) {
    if (!['buy', 'sell', 'dividend'].includes(tx.type)) continue;
    let p = map.get(tx.isin);
    if (!p) {
      p = { isin: tx.isin, name: tx.name, shares: 0, invested: 0, proceeds: 0, dividendsGross: 0, dividendsNet: 0, dividendTax: 0, hasTrades: false };
      map.set(tx.isin, p);
    }
    if (tx.name) p.name = tx.name;
    if (tx.type === 'buy') {
      p.invested -= tx.amount + tx.fee;
      p.shares = roundShares(p.shares + tx.shares);
      p.hasTrades = true;
    } else if (tx.type === 'sell') {
      p.proceeds += tx.amount + tx.fee;
      p.shares = roundShares(p.shares + tx.shares);
      p.hasTrades = true;
    } else {
      p.dividendsGross += tx.amount;
      p.dividendsNet += tx.amount + tx.tax;
      p.dividendTax += tx.tax;
    }
  }
  return [...map.values()].map((p) => finish(p, prices[p.isin], opts));
}

function finish(p, quote, { dividends = 'net', includeDividends = true }) {
  const closed = p.shares <= 0;
  const price = quote?.price ?? null;
  const value = closed ? 0 : price === null ? null : Math.round(price * p.shares);
  const d = dividends === 'gross' ? p.dividendsGross : p.dividendsNet;
  const priceResult = value === null ? null : value + p.proceeds - p.invested;
  const result = priceResult === null ? null : priceResult + (includeDividends ? d : 0);
  return {
    ...p,
    closed,
    price,
    priceDate: quote?.date ?? null,
    value,
    dividends: d,
    priceResult,
    result,
    performance: ratio(result, p.invested),
    dividendQuota: ratio(d, p.invested),
  };
}

export function computeTotals(positions, { includeDividends = true } = {}) {
  const sum = (key) => positions.reduce((s, p) => s + p[key], 0);
  const missingPrices = positions.filter((p) => p.value === null).length;
  const invested = sum('invested');
  const proceeds = sum('proceeds');
  const dividends = sum('dividends');
  const value = missingPrices ? null : sum('value');
  const priceResult = value === null ? null : value + proceeds - invested;
  const result = priceResult === null ? null : priceResult + (includeDividends ? dividends : 0);
  const realized = positions.filter((p) => p.closed && p.hasTrades).reduce((s, p) => s + p.priceResult, 0);
  return {
    invested,
    proceeds,
    dividends,
    dividendsGross: sum('dividendsGross'),
    dividendsNet: sum('dividendsNet'),
    dividendTax: sum('dividendTax'),
    value,
    missingPrices,
    priceResult,
    result,
    realized,
    performance: ratio(result, invested),
    dividendQuota: ratio(dividends, invested),
  };
}

// Groups dividends by 'month' | 'quarter' | 'year'. Newest first.
export function dividendsByPeriod(transactions, period = 'month') {
  const map = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'dividend') continue;
    const key = periodKey(tx.date, period);
    const row = map.get(key) || { period: key, gross: 0, net: 0, tax: 0 };
    row.gross += tx.amount;
    row.net += tx.amount + tx.tax;
    row.tax += tx.tax;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.period.localeCompare(a.period));
}

function periodKey(date, period) {
  const year = date.slice(0, 4);
  if (period === 'year') return year;
  if (period === 'quarter') return `${year}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
  return date.slice(0, 7);
}

function ratio(a, b) {
  return a === null || !b ? null : a / b;
}
