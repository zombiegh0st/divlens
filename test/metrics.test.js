import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/parsers/tr.js';
import { computePositions, computeTotals, dividendsByPeriod } from '../src/metrics.js';

const fixture = readFileSync(new URL('./fixtures/tr-export.csv', import.meta.url), 'utf8');
const { transactions } = parse(fixture);
const NVDA = 'US67066G1040';
const MAIN = 'US56035L1044';
const find = (positions, isin) => positions.find((p) => p.isin === isin);

test('NVIDIA example: closed position, price result +33.10 EUR (+22.1 %)', () => {
  const p = find(computePositions(transactions), NVDA);
  assert.equal(p.closed, true);
  assert.equal(p.shares, 0);
  assert.equal(p.invested, 15010);
  assert.equal(p.proceeds, 18320);
  assert.equal(p.value, 0);
  assert.equal(p.priceResult, 3310);
  assert.equal(p.performance.toFixed(3), '0.221');
});

test('dividends net and gross', () => {
  const net = find(computePositions(transactions, {}, { dividends: 'net' }), MAIN);
  const gross = find(computePositions(transactions, {}, { dividends: 'gross' }), MAIN);
  assert.equal(net.dividends, 1864);
  assert.equal(gross.dividends, 2196);
  assert.equal(net.dividendTax, -332);
  assert.equal(net.invested, 63700);
  assert.equal(net.shares, 14);
  assert.equal(net.dividendQuota, 1864 / 63700);
});

test('without a price W is unknown, dividend quota still available', () => {
  const p = find(computePositions(transactions), MAIN);
  assert.equal(p.value, null);
  assert.equal(p.priceResult, null);
  assert.equal(p.result, null);
  assert.equal(p.performance, null);
  assert.ok(p.dividendQuota > 0);
});

test('with a price: toggle adds or removes dividends only', () => {
  const prices = { [MAIN]: { price: 4500, date: '2026-10-09' } };
  const incl = find(computePositions(transactions, prices, { includeDividends: true }), MAIN);
  const excl = find(computePositions(transactions, prices, { includeDividends: false }), MAIN);
  assert.equal(incl.value, 63000);
  assert.equal(incl.priceResult, -700);
  assert.equal(excl.priceResult, -700);
  assert.equal(excl.result, -700);
  assert.equal(incl.result, -700 + 1864);
  assert.equal(incl.dividends, excl.dividends);
});

test('totals: incomplete without all prices, dividends of all positions counted', () => {
  const totals = computeTotals(computePositions(transactions));
  assert.equal(totals.invested, 199046);
  assert.equal(totals.dividendsNet, 3445);
  assert.equal(totals.dividendsGross, 4054);
  assert.equal(totals.missingPrices, 5);
  assert.equal(totals.value, null);
  assert.equal(totals.result, null);
  assert.equal(totals.realized, 3310);
});

test('totals: complete with all prices', () => {
  const prices = Object.fromEntries(
    computePositions(transactions).filter((p) => !p.closed).map((p) => [p.isin, { price: 1000 }]),
  );
  const opts = { includeDividends: true };
  const totals = computeTotals(computePositions(transactions, prices, opts), opts);
  const shares = 14 + 10 + 7 + 20 + 1;
  assert.equal(totals.value, shares * 1000);
  assert.equal(totals.priceResult, shares * 1000 + 18320 - 199046);
  assert.equal(totals.result, totals.priceResult + 3445);
});

test('dividends by period', () => {
  const months = dividendsByPeriod(transactions, 'month');
  assert.equal(months[0].period, '2026-10');
  assert.deepEqual(dividendsByPeriod(transactions, 'quarter').map((r) => r.period), ['2026-Q4', '2026-Q3', '2026-Q2']);
  const [year] = dividendsByPeriod(transactions, 'year');
  assert.deepEqual(year, { period: '2026', gross: 4054, net: 3445, tax: -609 });
});
