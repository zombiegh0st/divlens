// Minimal RFC 4180 CSV reader and decimal helpers.

// Returns [{ line, fields }], line = 1-based line where the record starts.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let fields = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else { if (c === '\n') line++; field += c; }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      fields.push(field);
      rows.push({ line: start, fields });
      fields = [];
      field = '';
      start = ++line;
    } else {
      field += c;
    }
  }
  if (field !== '' || fields.length) {
    fields.push(field);
    rows.push({ line: start, fields });
  }
  return rows;
}

// Converts a decimal string ("-149.10", "0.880000") to integer cents without float math.
// Rounds half away from zero.
export function toCents(value) {
  const s = String(value ?? '').trim();
  if (s === '') return 0;
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) throw new Error(`Ungültiger Betrag "${s}"`);
  const frac = (m[3] || '').padEnd(3, '0');
  let cents = Number(m[2] || '0') * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return m[1] === '-' && cents ? -cents : cents;
}
