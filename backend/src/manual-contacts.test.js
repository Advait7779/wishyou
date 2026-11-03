import test from 'node:test';
import assert from 'node:assert/strict';
import { manualContactRecord, manualContactSchema } from './manual-contacts.js';

test('manual form includes the requested fields without discarding imported columns', () => {
  const schema = manualContactSchema({
    columns: ['Full Name', 'Mobile', 'Wedding Date', 'Department'],
    mapping: { name: 'Full Name', phone: 'Mobile', birthday: '', anniversary: 'Wedding Date', dateFormat: 'MDY', countryCode: '' },
  });
  assert.deepEqual(schema.columns, ['Full Name', 'Mobile', 'Wedding Date', 'Department', 'Gender', 'DOB']);
  const record = manualContactRecord(schema, { 'Full Name': 'Asha', Mobile: '9876543210', Gender: 'Female', DOB: '1990-10-22', Department: 'Sales' });
  assert.equal(record.name, 'Asha');
  assert.equal(record.birth, '1990-10-22');
  assert.equal(record.data.Department, 'Sales');
});

test('a first manual record has a default dataset and needs an occasion date', () => {
  const schema = manualContactSchema(null);
  assert.deepEqual(schema.columns, ['Name', 'Contact', 'Gender', 'DOB', 'Anniversary']);
  assert.throws(() => manualContactRecord(schema, { Name: 'Asha', Contact: '9876543210' }), /birthdate or anniversary/i);
  assert.equal(manualContactRecord(schema, { Name: 'Asha', Contact: '9876543210', DOB: '1990-10-22' }).phone, '9876543210');
});

test('the current Name, Contact, Gender, DOB sheet keeps its column order', () => {
  const schema = manualContactSchema({
    columns: ['Name', 'Contact', 'Gender', 'DOB'],
    mapping: { name: 'Name', phone: 'Contact', birthday: 'DOB', anniversary: '', dateFormat: 'DMY', countryCode: '' },
  });
  assert.deepEqual(schema.columns, ['Name', 'Contact', 'Gender', 'DOB', 'Anniversary']);
  assert.equal(manualContactRecord(schema, { Name: 'Omkar', Contact: '7350036456', Gender: 'Male', DOB: '2003-10-22' }).birth, '2003-10-22');
});
