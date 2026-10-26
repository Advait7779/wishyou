import { readSheet } from 'read-excel-file/node';

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => String(value).trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  row.push(cell);
  if (row.some(value => String(value).trim() !== '')) rows.push(row);
  return rows;
}

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return cellText(value.result);
    if (value.richText) return value.richText.map(part => part.text).join('');
    return '';
  }
  return String(value);
}

export async function readSpreadsheet(file) {
  const lower = file.originalname.toLowerCase();
  let matrix;
  if (lower.endsWith('.csv')) matrix = parseCsv(file.buffer.toString('utf8'));
  else if (lower.endsWith('.xlsx')) {
    matrix = (await readSheet(file.buffer)).map(row => row.map(cellText));
  } else throw new Error('Upload a .csv or .xlsx file.');
  if (matrix.length < 2) throw new Error('The file needs a header row and at least one contact.');
  if (matrix.length > 50001) throw new Error('This version supports up to 50,000 contacts per upload.');
  const headers = matrix[0].map(value => String(value).trim());
  if (headers.some(header => !header)) throw new Error('Every column needs a header. Rename blank headers in the file.');
  if (new Set(headers.map(header => header.toLowerCase())).size !== headers.length) throw new Error('Column headers must be unique.');
  return { headers, rows: matrix.slice(1).filter(row => row.some(value => String(value ?? '').trim())) };
}

export function normalizePhone(value, countryCode = '') {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && countryCode) digits = countryCode + digits;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function parseDate(value, format = 'DMY') {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial <= 90000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
  }
  let year, month, day;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) [, year, month, day] = iso;
  else {
    const parts = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(text);
    if (!parts) return null;
    year = parts[3];
    [day, month] = format === 'MDY' ? [parts[2], parts[1]] : [parts[1], parts[2]];
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function inferMapping(sheet) {
  const key = header => header.toLowerCase().replace(/[^a-z0-9]/g, '');
  const samples = sheet.rows.slice(0, 100);
  const phoneHeaders = ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber', 'whatsapp', 'telephone', 'tel', 'cell', 'cellphone', 'number', 'phoneno', 'mobileno', 'contactno'];
  const phone = sheet.headers.map((header, index) => {
    const name = key(header);
    const valid = samples.filter(row => normalizePhone(row[index])).length;
    const exact = phoneHeaders.includes(name);
    const keyword = /phone|mobile|contact|whatsapp|telephone|cell/.test(name);
    return { header, valid, score: (exact ? 20 : keyword ? 10 : 0) + (samples.length ? valid / samples.length * 10 : 0) };
  }).filter(candidate => candidate.valid > 0).sort((a, b) => b.score - a.score)[0]?.header || '';
  const name = sheet.headers.find(header => key(header) === 'name') || sheet.headers.find(header => /(?:full|first|customer|client|contact)name/.test(key(header))) || '';
  const birthday = sheet.headers.find(header => /^(dob|dateofbirth|birthdate|birthday|bday)$/.test(key(header))) || sheet.headers.find(header => /birth/.test(key(header))) || '';
  const anniversary = sheet.headers.find(header => /anniv|wedding|marriage/.test(key(header))) || '';
  if (!phone) throw new Error('Could not identify a phone column. Use a header such as Phone, Mobile, or Contact with valid numbers.');
  if (!birthday && !anniversary) throw new Error('Could not identify a birthdate or anniversary column. Use a header such as DOB, Birthday, or Anniversary.');
  const dateColumns = [birthday, anniversary].filter(Boolean);
  const dateValues = samples.flatMap(row => dateColumns.map(header => row[sheet.headers.indexOf(header)]).filter(Boolean));
  const dmy = dateValues.filter(value => parseDate(value, 'DMY')).length;
  const mdy = dateValues.filter(value => parseDate(value, 'MDY')).length;
  return { name, phone, birthday, anniversary, dateFormat: mdy > dmy ? 'MDY' : 'DMY', countryCode: '' };
}

export function transformRows(sheet, mapping) {
  if (!sheet.headers.includes(mapping.phone)) throw new Error('Map a phone number column before importing.');
  if (!sheet.headers.includes(mapping.birthday) && !sheet.headers.includes(mapping.anniversary)) throw new Error('Map at least one event date column.');
  const valid = [], invalid = [], phones = new Set();
  sheet.rows.forEach((values, index) => {
    const data = Object.fromEntries(sheet.headers.map((header, i) => [header, values[i] ?? '']));
    const phone = normalizePhone(data[mapping.phone], mapping.countryCode ?? '');
    const birth = mapping.birthday ? parseDate(data[mapping.birthday], mapping.dateFormat) : null;
    const anniversary = mapping.anniversary ? parseDate(data[mapping.anniversary], mapping.dateFormat) : null;
    const reasons = [];
    if (!phone) reasons.push('Invalid phone number');
    if (mapping.birthday && data[mapping.birthday] && !birth) reasons.push('Invalid birthdate');
    if (mapping.anniversary && data[mapping.anniversary] && !anniversary) reasons.push('Invalid anniversary date');
    if (phone && phones.has(phone)) reasons.push('Duplicate phone in file');
    if (reasons.length) invalid.push({ row: index + 2, reasons, data });
    else {
      phones.add(phone);
      valid.push({ data, phone, name: mapping.name ? String(data[mapping.name] ?? '') : '', birth, anniversary });
    }
  });
  return { valid, invalid };
}
