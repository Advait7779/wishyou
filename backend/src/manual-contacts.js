import { transformRows } from './imports.js';
import { clientError } from './api-errors.js';

const DEFAULT_COLUMNS = ['Name', 'Contact', 'Gender', 'DOB', 'Anniversary'];

export function manualContactSchema(dataset) {
  if (!dataset) {
    return {
      columns: [...DEFAULT_COLUMNS],
      mapping: { name: 'Name', phone: 'Contact', birthday: 'DOB', anniversary: 'Anniversary', dateFormat: 'DMY', countryCode: '' },
      gender: 'Gender',
    };
  }

  const columns = [...dataset.columns];
  const mapping = { ...dataset.mapping };
  const ensureColumn = label => {
    const existing = columns.find(column => column.toLowerCase() === label.toLowerCase());
    if (existing) return existing;
    columns.push(label);
    return label;
  };
  mapping.name ||= ensureColumn('Name');
  mapping.phone ||= ensureColumn('Contact');
  const gender = columns.find(column => /^(gender|sex)$/i.test(column.trim())) || ensureColumn('Gender');
  mapping.birthday ||= ensureColumn('DOB');
  mapping.anniversary ||= ensureColumn('Anniversary');
  mapping.dateFormat ||= 'DMY';
  mapping.countryCode ||= '';
  return { columns, mapping, gender };
}

export function manualContactRecord(schema, submitted) {
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) throw clientError('Complete the contact form.');
  const values = schema.columns.map(column => String(Object.hasOwn(submitted, column) ? submitted[column] ?? '' : '').trim());
  const sheet = { headers: schema.columns, rows: [values] };
  const data = Object.fromEntries(schema.columns.map((column, index) => [column, values[index]]));
  if (!data[schema.mapping.name]) throw clientError('Enter a name.');
  if (!data[schema.mapping.phone]) throw clientError('Enter a contact number.');
  const transformed = transformRows(sheet, schema.mapping);
  if (transformed.invalid.length) throw clientError(transformed.invalid[0].reasons.join(', '));
  const record = transformed.valid[0];
  if (!record.birth && !record.anniversary) throw clientError('Enter a birthdate or anniversary date.');
  return record;
}
