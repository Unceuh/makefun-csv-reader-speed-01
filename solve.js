// Fast drop-in for csv-reader 1.0.0 (make.fun): the same answers, a single pass, bulk slices.
// Semantics mirror vendor/csv-reader/index.js exactly; only the scanning is bulk:
// unquoted fields are cut with one regex scan to the next delimiter, quoted fields with
// indexOf('"'), and whole clean lines are split at once. Pure: no clock, no randomness,
// no locale, nothing kept from one call to the next.
//
// Speed notes: the field readers communicate through shared locals (fv/fe/fa) instead of
// returning a fresh object per field, and no per-character loop or closure runs per field.

const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  let recordLine = 1;
  let recordRow = null;
  // The field just read: its value, how it ended, and how many characters readUnquoted kept.
  let fv = '';
  let fe = END;
  let fa = 0;
  // Next CR at or after pos (-2 unknown, -1 none left). Cached: pos only moves forward,
  // so the scans that refresh it cover disjoint ranges and cost O(n) over a whole run.
  let nextCR = -2;

  function ensureCR() {
    if (nextCR === -2 || (nextCR !== -1 && nextCR < pos)) nextCR = text.indexOf('\r', pos);
  }

  // Current line's end: le is the index of its LF (or n), ce its content end
  // (le minus 1 when the line ends CRLF). Recomputed at each record start and
  // whenever a quoted field carries the record across a line break.
  let le = 0;
  let ce = 0;

  function refreshLine() {
    le = text.indexOf('\n', pos);
    if (le === -1) le = n;
    ce = le;
    if (le < n && le > pos && text.charCodeAt(le - 1) === 13) ce = le - 1;
  }

  // A raw quoted segment: CRLF and a lone CR each become one LF; every line break counts into `line`.
  function cleanSeg(s) {
    if (s.indexOf('\r') !== -1) s = s.replace(/\r\n?/g, '\n');
    let i = s.indexOf('\n');
    while (i !== -1) {
      line += 1;
      i = s.indexOf('\n', i + 1);
    }
    return s;
  }

  // Read an unquoted field from pos onto `value`; sets fv/fe/fa.
  function readUnquoted(value) {
    fv = value;
    fa = 0;
    for (;;) {
      let c = text.indexOf(',', pos);
      let l = text.indexOf('\n', pos);
      if (c === -1) c = n;
      if (l === -1) l = n;
      const end = c < l ? c : l;
      ensureCR();
      if (nextCR !== -1 && nextCR < end) {
        const d = nextCR;
        if (text.charCodeAt(d + 1) === 10) {
          // CRLF: the field ends here at a line break.
          if (d > pos) {
            fv += text.slice(pos, d);
            fa += d - pos;
          }
          pos = d + 2;
          line += 1;
          fe = BREAK;
          return;
        }
        // A lone CR is dropped (stray_cr) and the field goes on.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (d > pos) {
          fv += text.slice(pos, d);
          fa += d - pos;
        }
        pos = d + 1;
        nextCR = -2;
        continue;
      }
      if (end >= n) {
        if (pos < n) {
          fv += text.slice(pos);
          fa += n - pos;
          pos = n;
        }
        fe = END;
        return;
      }
      if (end > pos) {
        fv += text.slice(pos, end);
        fa += end - pos;
      }
      if (end === c) {
        pos = end + 1;
        fe = COMMA;
        return;
      }
      pos = end + 1;
      line += 1;
      fe = BREAK;
      return;
    }
  }

  // Read a quoted field whose opening quote is at pos; sets fv/fe/fa.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let parts = null;
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it
        // is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote; keep going.
        if (parts === null) parts = [];
        parts.push(cleanSeg(text.slice(pos, q)));
        parts.push('"');
        pos = q + 2;
        continue;
      }
      // The closing quote is at q.
      const seg = cleanSeg(text.slice(pos, q));
      fv = parts === null ? seg : (parts.push(seg), parts.join(''));
      pos = q + 1;
      if (pos >= n) {
        fe = END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fe = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fe = BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fe = BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands.
      readUnquoted(fv);
      if (fa > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  // Finish a record: width, header, short/long padding or cutting, then store it.
  function emit(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a whole line with no quote and no CR is one plain record.
    refreshLine();
    const q = text.indexOf('"', pos);
    const r = text.indexOf('\r', pos);
    if ((q === -1 || q >= ce) && (r === -1 || r >= ce)) {
      if (ce === pos) {
        // Empty line: no record.
        pos = le < n ? le + 1 : n;
        line += 1;
        continue;
      }
      const fields = text.slice(pos, ce).split(',');
      pos = le < n ? le + 1 : n;
      line += 1;
      emit(fields);
      continue;
    }

    // Slow path: field by field.
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        const lb = line;
        readQuoted();
        if (line !== lb) refreshLine();
      }
      else {
        // Unquoted field on the current line: one indexOf(',') finds it, bounded
        // by the line's content end ce (a comma past ce belongs to a later line).
        // A lone CR inside the content is dropped (stray_cr) and the field goes on.
        fv = '';
        fa = 0;
        unq: for (;;) {
          const c = text.indexOf(',', pos);
          ensureCR();
          if (nextCR !== -1 && nextCR < ce && (c === -1 || nextCR < c)) {
            const d = nextCR;
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (d > pos) { fv += text.slice(pos, d); fa += d - pos; }
            pos = d + 1;
            nextCR = -2;
            continue unq;
          }
          if (c !== -1 && c < ce) {
            if (c > pos) { fv += text.slice(pos, c); fa += c - pos; }
            pos = c + 1;
            fe = COMMA;
            break unq;
          }
          // The field runs to the line end (content end ce, CRLF's CR excluded).
          if (ce > pos) { fv += text.slice(pos, ce); fa += ce - pos; }
          if (le >= n) { pos = n; fe = END; break unq; }
          pos = le + 1;
          line += 1;
          fe = BREAK;
          break unq;
        }
      }
      fields.push(fv);
    } while (fe === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    emit(fields);
  }

  return { columns: header ? columns ?? [] : null, rows, errors };
}
