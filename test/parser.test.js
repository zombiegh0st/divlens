import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detect, parse } from '../src/parsers/tr.js';
import { findParser, planImport } from '../src/import.js';
import { toCents } from '../src/csv.js';

const fixture = readFileSync(new URL('./fixtures/tr-export.csv', import.meta.url), 'utf8');
const header = fixture.split('\n')[0];
const result = parse(fixture, { source: 'tr-export.csv' });
const byId = (id) => result.transactions.find((t) => t.id === id);

test('detects the Trade Republic format', () => {
  assert.equal(detect(fixture), true);
  assert.equal(findParser(fixture)?.id, 'tr');
  assert.equal(detect('a,b,c\n1,2,3'), false);
});

test('parses the fixture without errors', () => {
  assert.deepEqual(result.errors, []);
  assert.equal(result.transactions.length, 25);
  assert.equal(result.ignored, 4);
});

test('buy with fee', () => {
  const tx = byId('2ac12d28-2b11-401c-ab58-8633c73bd32e');
  assert.deepEqual(
    { type: tx.type, isin: tx.isin, name: tx.name, shares: tx.shares, amount: tx.amount, fee: tx.fee, date: tx.date },
    { type: 'buy', isin: 'US67066G1040', name: 'NVIDIA', shares: 1, amount: -14910, fee: -100, date: '2026-03-23' },
  );
});

test('sell with negative shares', () => {
  const tx = byId('ce853339-1b56-4113-8636-8aa156ecbb39');
  assert.equal(tx.type, 'sell');
  assert.equal(tx.shares, -1);
  assert.equal(tx.amount, 18420);
  assert.equal(tx.fee, -100);
});

test('dividend with tax and FX', () => {
  const tx = byId('019d965a-ca9d-754f-b9e2-714375e4a139');
  assert.equal(tx.type, 'dividend');
  assert.equal(tx.shares, 4);
  assert.equal(tx.amount, 88);
  assert.equal(tx.tax, -14);
  assert.equal(tx.originalAmount, 104);
  assert.equal(tx.originalCurrency, 'USD');
  assert.equal(tx.fxRate, 0.847961);
});

test('ignores transfers', () => {
  assert.ok(result.transactions.every((t) => t.type !== 'unknown'));
  assert.equal(byId('019d1a28-b5d4-711d-852d-6bbcd74b23ab'), undefined);
});

test('never stores personal fields', () => {
  const keys = new Set(result.transactions.flatMap(Object.keys));
  for (const k of ['description', 'counterparty_name', 'counterparty_iban', 'payment_reference']) {
    assert.equal(keys.has(k), false);
  }
  assert.ok(!JSON.stringify(result).includes('Mustermann'));
});

test('duplicate re-import creates 0 new records', () => {
  const first = planImport(result.transactions);
  assert.equal(first.fresh.length, 25);
  const again = planImport(parse(fixture).transactions, new Set(first.fresh.map((t) => t.id)));
  assert.equal(again.fresh.length, 0);
  assert.equal(again.duplicates, 25);
});

test('overlapping exports merge cleanly', () => {
  const lines = fixture.trim().split('\n');
  const a = parse([header, ...lines.slice(1, 20)].join('\n')).transactions;
  const b = parse([header, ...lines.slice(10)].join('\n')).transactions;
  const stored = new Set(planImport(a).fresh.map((t) => t.id));
  const second = planImport(b, stored);
  assert.equal(stored.size + second.fresh.length, 25);
  assert.ok(second.duplicates > 0);
});

test('duplicate rows within one file count once', () => {
  const lines = fixture.trim().split('\n');
  const { fresh, duplicates } = planImport(parse([header, lines[2], lines[2]].join('\n')).transactions);
  assert.equal(fresh.length, 1);
  assert.equal(duplicates, 1);
});

test('unknown type is kept and reported', () => {
  const row = '"2026-06-01T00:00:00Z","2026-06-01","DEFAULT","CASH","INTEREST_PAYMENT","","","","","","1.23","","","EUR","","","","Interest","u-1","","","",""';
  const { transactions, errors } = parse(`${header}\n${row}`);
  assert.deepEqual(errors, []);
  assert.equal(transactions[0].type, 'unknown');
  assert.equal(transactions[0].rawType, 'INTEREST_PAYMENT');
  assert.equal(transactions[0].amount, 123);
});

test('bad row is reported without aborting the import', () => {
  const lines = fixture.trim().split('\n');
  const bad = lines[2].replace('"2026-03-23"', '"23.03.2026"');
  const { transactions, errors } = parse([header, bad, lines[3]].join('\n'));
  assert.equal(transactions.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.match(errors[0].message, /Datum/);
});

test('toCents is exact', () => {
  assert.equal(toCents('-149.10'), -14910);
  assert.equal(toCents('0.880000'), 88);
  assert.equal(toCents('500.000000'), 50000);
  assert.equal(toCents('0.125'), 13);
  assert.equal(toCents('-0.125'), -13);
  assert.equal(toCents('0.1249'), 12);
  assert.equal(toCents(''), 0);
  assert.equal(Object.is(toCents('-0.00'), 0), true);
  assert.throws(() => toCents('1,5'));
});
