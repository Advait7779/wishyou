import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { api, API_URL, authorizedHeaders, json } from './api';
import { Button, c, Choice, Dialog, Field, Heading, Icon, IconName, Notice, s } from './ui';

export function Contacts({ tick }: { tick: number }) {
  const [result, setResult] = useState<any>(null); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [search, setSearch] = useState(''); const [cursor, setCursor] = useState<string | null>(null); const [stack, setStack] = useState<(string | null)[]>([]);
  const [reload, setReload] = useState(0); const [busy, setBusy] = useState(false); const [edit, setEdit] = useState<any>(null); const [review, setReview] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false); const [job, setJob] = useState<any>(null); const [uploading, setUploading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const uploadRef = useRef<AbortController | null>(null); const datasetRef = useRef<string | null>(null); const mounted = useRef(true);
  const totalRef = useRef<{ search: string; dataset: string | null; total: number } | null>(null);
  const generationRef = useRef({ tick, reload });
  const invalidate = useCallback(() => { setCursor(null); setStack([]); datasetRef.current = null; setReload(v => v + 1); }, []);
  const completed = useRef<string | null>(null);
  const acceptJob = useCallback((value: any) => { if (!mounted.current) return; setJob(value); if (value?.status === 'completed' && completed.current !== value.id) { completed.current = value.id; invalidate(); } }, [invalidate]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; uploadRef.current?.abort(); }; }, []);
  useEffect(() => {
    if (search.trim() && search.trim().length < 3) return;
    if (generationRef.current.tick !== tick || generationRef.current.reload !== reload) { totalRef.current = null; generationRef.current = { tick, reload }; }
    const controller = new AbortController();
    const params = new URLSearchParams({ search }); if (cursor) params.set('before', cursor); if (datasetRef.current) params.set('datasetId', datasetRef.current);
    const cached = totalRef.current?.search === search.trim() && totalRef.current?.dataset === datasetRef.current ? totalRef.current : null;
    if (cached) params.set('includeTotal', 'false');
    const timer = setTimeout(() => { setBusy(true); setError(''); api(`/contacts?${params}`, { signal: controller.signal }).then(value => { datasetRef.current = value.dataset?.id || null; const total = value.total ?? cached?.total ?? 0; totalRef.current = { search: search.trim(), dataset: datasetRef.current, total }; setResult({ ...value, total }); }).catch(e => { if (controller.signal.aborted) return; if (e.status === 409) invalidate(); else setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); }); }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [search, cursor, reload, tick, invalidate]);
  useEffect(() => { const controller = new AbortController(); api('/imports/uploads/latest', { signal: controller.signal }).then(acceptJob).catch(() => {}); return () => controller.abort(); }, [tick, acceptJob]);
  const jobId = job?.id; const jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || !['uploading', 'queued', 'processing', 'waiting_for_sends'].includes(jobStatus)) return;
    let inFlight = false; const controller = new AbortController();
    const poll = () => { if (inFlight || uploadRef.current || AppState.currentState !== 'active') return; inFlight = true; api(`/imports/uploads/${jobId}`, { signal: controller.signal }).then(acceptJob).catch(e => { if (!controller.signal.aborted && e.status === 404) setJob(null); }).finally(() => { inFlight = false; }); };
    const timer = setInterval(poll, 3000); return () => { clearInterval(timer); controller.abort(); };
  }, [jobId, jobStatus, acceptJob]);
  const activeImport = ['uploading', 'queued', 'processing', 'waiting_for_sends'].includes(job?.status);
  async function removeUpload() { if (!job) return; uploadRef.current?.abort(); try { await api(`/imports/uploads/${job.id}`, { method: 'DELETE' }); setJob(null); setMessage('Upload removed.'); } catch (e: any) { setError(e.message); } }
  async function clear() { await api('/contacts/clear', json('POST', { confirm: 'CLEAR' })); invalidate(); setConfirmClear(false); setMessage('Contacts cleared.'); }
  async function remove(contact: any) { await api(`/contacts/${contact.id}`, { method: 'DELETE' }); setDeleting(null); invalidate(); setMessage('Contact deleted.'); }
  async function importFile(dateFormat: string) {
    if (uploadRef.current) return;
    let handle: ReturnType<File['open']> | undefined;
    const controller = new AbortController(); uploadRef.current = controller; setUploading(true); setError(''); setImportOpen(false);
    let sub: ReturnType<typeof AppState.addEventListener> | undefined;
    try {
      const selected = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'], copyToCacheDirectory: false });
      if (selected.canceled || controller.signal.aborted) return;
      sub = AppState.addEventListener('change', state => { if (state === 'background') controller.abort(); });
      const asset = selected.assets[0]; const file = new File(asset.uri); const size = asset.size || file.size;
      if (!/\.(csv|xlsx)$/i.test(asset.name) || !size) throw new Error('Choose a CSV or XLSX file with a valid size.');
      const fingerprint = `${asset.name}:${size}:${dateFormat}`;
      let current = job?.status === 'uploading' && job.filename === asset.name && job.size === size && job.dateFormat === dateFormat ? await api(`/imports/uploads/${job.id}`) : null;
      if (!current) current = await api('/imports/uploads', json('POST', { filename: asset.name, size, dateFormat }));
      acceptJob(current); handle = file.open();
      let offset = current.offset;
      while (offset < size) {
        if (controller.signal.aborted) { if (mounted.current) setMessage('Upload paused. Select the same file to resume.'); return; }
        handle.offset = offset;
        const bytes = handle.readBytes(Math.min(4 * 1024 * 1024, size - offset));
        const headers = await authorizedHeaders();
        const response = await expoFetch(`${API_URL}/api/imports/uploads/${current.id}`, { method: 'PATCH', body: bytes,
          headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(offset), 'Content-Length': String(bytes.byteLength) }, signal: controller.signal });
        const next: any = await response.json();
        if (!response.ok) throw new Error(next.error || 'Upload interrupted. Select the same file to resume.');
        offset = next.offset; acceptJob(next);
      }
      if (!controller.signal.aborted) { acceptJob(await api(`/imports/uploads/${current.id}/complete`, json('POST', {}))); if (mounted.current) setMessage(`Upload complete. ${fingerprint.split(':')[0]} is importing on the server.`); }
    } catch (e: any) { if (mounted.current) { if (controller.signal.aborted) setMessage('Upload paused. Select the same file to resume.'); else setError(e.message); } }
    finally { handle?.close(); sub?.remove(); uploadRef.current = null; if (mounted.current) setUploading(false); }
  }
  const columns: string[] = result?.dataset?.columns || []; const widths = columns.map(column => /name|address|email/i.test(column) ? 132 : 112); const tableWidth = widths.reduce((a, b) => a + b, 0) + 272;
  const usableSearch = !search.trim() || search.trim().length >= 3;
  const rows = usableSearch ? result?.items || [] : [];
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
    <Heading eyebrow="YOUR PEOPLE" title="Contact directory" compact />
    <Field label="Search contacts" value={search} onChangeText={value => { setSearch(value); setBusy(false); setCursor(null); setStack([]); }} placeholder="Search 3+ characters in any column…" />
    <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}><Button title="Add record" icon="plus" compact soft disabled={activeImport} onPress={() => setEdit({ adding: true, data: {}, active: true })} /><Button title={job?.status === 'uploading' ? 'Resume import' : 'Import more'} icon="upload" compact disabled={uploading || (activeImport && job?.status !== 'uploading')} onPress={() => setImportOpen(true)} /><Button title="Clear dataset" icon="trash-2" compact soft disabled={activeImport || !result?.dataset} onPress={() => setConfirmClear(true)} /></View>
    {!!error && <Notice text={error} error />}{!!message && <Pressable onPress={() => setMessage('')}><Notice text={message} /></Pressable>}
    {job && job.status !== 'completed' && <View style={{ padding: 10, backgroundColor: c.soft, borderRadius: 10, gap: 6 }}><Text style={s.label}>{job.status === 'uploading' ? `Uploading ${Math.round(job.offset / job.size * 100)}%` : job.status === 'processing' ? `Importing · ${job.processedRows.toLocaleString()} rows checked` : job.status === 'waiting_for_sends' ? 'Waiting for active sends to finish' : job.status === 'failed' ? 'Import failed' : 'Queued for import'}</Text>{!!job.error && <Text style={s.copy}>{job.error}</Text>}{['uploading', 'failed'].includes(job.status) && <Button title={job.status === 'failed' ? 'Dismiss failed import' : uploading ? 'Pause upload' : 'Cancel upload'} soft onPress={uploading ? () => uploadRef.current?.abort() : removeUpload} />}</View>}
    <ScrollView horizontal style={{ backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled">
      <View style={{ width: tableWidth }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#fff8f2', borderBottomWidth: 1, borderTopWidth: 1, borderColor: c.border }}>{[...columns, 'Status', 'Action'].map((column, i) => <Text key={`${column}-${i}`} style={{ width: i < columns.length ? widths[i] : i === columns.length ? 76 : 196, paddingHorizontal: 10, paddingVertical: 12, color: c.ink, fontWeight: '700', fontSize: 11 }}>{column}</Text>)}</View>
        {!rows.length && <View style={{ padding: 25 }}><Text style={s.copy}>{busy ? 'Loading…' : !usableSearch ? 'Enter at least 3 characters to search.' : 'No contacts found. Add a record or import a file.'}</Text></View>}
        {rows.map((item: any) => <ContactTableRow key={String(item.id)} item={item} columns={columns} widths={widths} onEdit={setEdit} onReview={setReview} onDelete={setDeleting} />)}
      </View>
    </ScrollView>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}><Button title="Previous" soft disabled={!stack.length || busy} onPress={() => { setCursor(stack.at(-1) || null); setStack(stack.slice(0, -1)); }} /><Text style={s.copy}>{busy ? 'Loading…' : `Page ${stack.length + 1}`}</Text><Button title="Next" soft disabled={!result?.nextCursor || busy || !usableSearch} onPress={() => { setStack([...stack, cursor]); setCursor(result.nextCursor); }} /></View>
    {edit && <ContactForm record={edit} schema={edit.adding ? result?.manualSchema : { columns, mapping: result?.dataset?.mapping || {} }} datasetId={result?.dataset?.id || null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setSearch(''); invalidate(); setMessage(edit.adding ? 'Contact added.' : 'Contact updated.'); }} />}
    {review && <GreetingReview contact={review.contact} initialChannel={review.channel} tick={tick} onClose={() => setReview(null)} onSent={() => { setReview(null); setMessage('Greeting queued. Reopen the review to check the provider response.'); }} />}
    {importOpen && <ImportDialog replacing={Boolean(result?.dataset)} onClose={() => setImportOpen(false)} onImport={importFile} />}
    {confirmClear && <DestructiveConfirmation title="Clear this dataset?" body="This permanently removes all contacts, imported columns, and past send records." actionLabel="Clear dataset" busyLabel="Clearing…" onClose={() => setConfirmClear(false)} onConfirm={clear} />}
    {deleting && <DestructiveConfirmation title="Delete contact?" body={`This permanently removes ${deleting.display_name || 'this contact'} and their send records. Any unsent wishes will be canceled.`} actionLabel="Delete contact" busyLabel="Deleting…" onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
  </ScrollView>;
}

function DestructiveConfirmation({ title, body, actionLabel, busyLabel, onClose, onConfirm }: { title: string; body: string; actionLabel: string; busyLabel: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function confirm() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onConfirm(); } catch (cause: any) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Dialog title={title} onClose={onClose} busy={busy} compact icon="trash-2">
    <Text style={[s.copy, { fontSize: 12, lineHeight: 19 }]}>{body}</Text>
    <Notice text={error} error />
    <View style={[s.actions, { flexWrap: 'nowrap', gap: 8, marginTop: 2 }]}><Button title="Cancel" compact soft disabled={busy} onPress={onClose} /><Button title={busy ? busyLabel : actionLabel} compact icon="trash-2" danger busy={busy} onPress={confirm} /></View>
  </Dialog>;
}

function ContactTableRow({ item, columns, widths, onEdit, onReview, onDelete }: { item: any; columns: string[]; widths: number[]; onEdit: (value: any) => void; onReview: (value: any) => void; onDelete: (value: any) => void }) {
  const action = (icon: IconName, label: string, onPress: () => void) => <Pressable key={label} accessibilityLabel={`${label} ${item.display_name || 'contact'}`} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === 'trash-2' ? '#fff0ee' : c.soft }}><Icon name={icon} color={icon === 'trash-2' ? c.red : c.orange} size={14} /></View></Pressable>;
  return <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f6ede6', alignItems: 'center', minHeight: 56 }}>
    {columns.map((column, i) => <Text key={column} numberOfLines={2} style={{ width: widths[i], paddingHorizontal: 10, paddingVertical: 10, color: '#66574b', fontSize: 11 }}>{String(item.data[column] ?? '') || '—'}</Text>)}
    <View style={{ width: 76, paddingHorizontal: 10 }}><Text style={{ color: item.active ? c.green : c.muted, backgroundColor: item.active ? '#e8f7ef' : '#f3f0ed', fontSize: 9, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 4, alignSelf: 'flex-start' }}>{item.active ? 'Active' : 'Paused'}</Text></View>
    <View style={{ width: 196, flexDirection: 'row', gap: 2, paddingHorizontal: 6 }}>
      {action('edit-2', 'Edit', () => onEdit({ ...item, data: { ...item.data } }))}
      {action('message-square', 'Send SMS to', () => onReview({ contact: item, channel: 'sms' }))}
      {action('phone-call', 'Call', () => onReview({ contact: item, channel: 'voice' }))}
      {action('trash-2', 'Delete', () => onDelete(item))}
    </View>
  </View>;
}

function ContactForm({ record, schema, datasetId, onClose, onSaved }: any) {
  const fallback = { columns: ['Name', 'Contact', 'Gender', 'DOB', 'Anniversary'], mapping: { name: 'Name', phone: 'Contact', birthday: 'DOB', anniversary: 'Anniversary' } };
  const fields = schema || fallback; const [data, setData] = useState<Record<string, string>>(record.data); const [active, setActive] = useState(record.active); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() { if (busy) return; setBusy(true); setError(''); try { await api(record.adding ? '/contacts' : `/contacts/${record.id}`, json(record.adding ? 'POST' : 'PATCH', { datasetId, data, active })); onSaved(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }
  return <Dialog title={record.adding ? 'Add record' : 'Edit contact'} onClose={onClose} busy={busy}>{fields.columns.map((column: string) => <Field key={column} label={column} value={String(data[column] || '')} onChangeText={value => setData({ ...data, [column]: value })} autoCapitalize={column === fields.mapping.phone ? 'none' : 'words'} keyboardType={column === fields.mapping.phone ? 'phone-pad' : 'default'} placeholder={column === fields.mapping.birthday || column === fields.mapping.anniversary ? 'YYYY-MM-DD' : column} />)}<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={s.label}>Active for wishes</Text><Switch value={active} onValueChange={setActive} trackColor={{ true: '#f8b38c' }} thumbColor={active ? c.orange : '#ddd'} /></View><Notice text={error} error /><View style={s.actions}><Button title="Cancel" soft disabled={busy} onPress={onClose} /><Button title={record.adding ? 'Add record' : 'Save contact'} icon="save" busy={busy} onPress={save} /></View></Dialog>;
}

function ImportDialog({ replacing, onClose, onImport }: any) {
  const [format, setFormat] = useState('');
  return <Dialog title="Import your people" onClose={onClose}><Text style={s.copy}>Choose the date order used in your CSV or Excel file. Real Excel dates and YYYY-MM-DD work with either choice.</Text><Choice value={format} options={[{ value: 'DMY', label: 'DD / MM / YYYY' }, { value: 'MDY', label: 'MM / DD / YYYY' }]} onChange={setFormat} />{replacing && <Notice text="The validated file will replace the current contact dataset. Past sends are kept." />}<Text style={s.copy}>Keep the app open while uploading. If interrupted, select the same file to resume. Very large files are best uploaded from the web panel.</Text><Button title="Choose CSV or Excel" icon="upload" disabled={!format} onPress={() => onImport(format)} /></Dialog>;
}

function GreetingReview({ contact, initialChannel, tick, onClose, onSent }: any) {
  const [occasion, setOccasion] = useState(contact.birth_date ? 'birthday' : 'anniversary'); const [channel, setChannel] = useState(initialChannel); const [review, setReview] = useState<any>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [reload, setReload] = useState(0);
  useEffect(() => { const controller = new AbortController(); api(`/contacts/${contact.id}/greeting-review?occasion=${occasion}&channel=${channel}`, { signal: controller.signal }).then(value => { setReview(value); setError(''); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [contact.id, occasion, channel, tick, reload]);
  const keyName = `wishyou-send-${API_URL.replace(/[^a-zA-Z0-9]/g, '_')}-${contact.id}-${occasion}-${channel}`;
  async function send() {
    if (busy) return; setBusy(true); setError('');
    try { let key = await SecureStore.getItemAsync(keyName); if (!key) { key = Crypto.randomUUID(); await SecureStore.setItemAsync(keyName, key); }
      await api(`/contacts/${contact.id}/send-greeting`, { ...json('POST', { occasion, channel }), headers: { 'Idempotency-Key': key } });
      await SecureStore.deleteItemAsync(keyName); onSent();
    } catch (e: any) { setError(e.message); if (e.status >= 400 && e.status < 500 && e.status !== 401) { await SecureStore.deleteItemAsync(keyName); setReload(v => v + 1); } }
    finally { setBusy(false); }
  }
  const date = review?.contact?.[occasion === 'birthday' ? 'birth_date' : 'anniversary_date'];
  const canSend = review?.sendingEnabled !== false && review?.configured && review.contact.active && date && !review.pending && !review.mismatchedName && review.manualLimit?.remaining > 0 && !loading;
  return <Dialog title="Review greeting before sending" onClose={onClose} busy={busy}>
    <Text style={s.label}>Occasion</Text><Choice value={occasion} options={[{ value: 'birthday', label: 'Birthday' }, { value: 'anniversary', label: 'Anniversary' }]} onChange={value => { if (!busy && value !== occasion) { setReview(null); setLoading(true); setOccasion(value); } }} />
    <Text style={s.label}>Channel</Text><Choice value={channel} options={[{ value: 'sms', label: 'SMS' }, { value: 'voice', label: 'Voice call' }]} onChange={value => { if (!busy && value !== channel) { setReview(null); setLoading(true); setChannel(value); } }} />
    <Text style={s.copy}>Contact: {contact.display_name || 'Friend'}{'\n'}Recipient: {contact.phone}{'\n'}Occasion date: {date || 'Not on file'}</Text>
    {loading && <ActivityIndicator color={c.orange} />}{review && <>
      {!review.configured && <Notice text="This greeting is not configured. Add its provider URL in the web panel Settings." />}
      {review.sendingEnabled === false && <Notice text="Sending is paused on this local test server. Greeting previews are available." />}
      {date && !review.occasionToday && <Notice text="This occasion is not today. Check the date before sending." />}
      {!!review.previewText && <View style={{ padding: 14, backgroundColor: c.bg, borderRadius: 11 }}><Text style={s.label}>{channel === 'sms' ? 'SMS message' : 'Voice script preview'}</Text><Text style={s.copy}>{review.previewText}</Text></View>}
      {!!review.mismatchedName && <Notice text="The saved SMS addresses another name. Correct the name placeholder in web Settings." error />}
      {review.pending && <Notice text="A greeting is already queued or sending. Refresh to check its result." />}
      <Text style={s.copy}>Manual sends remaining: {review.manualLimit?.remaining || 0} of 2 in the last 24 hours.</Text>
      {review.manualLimit?.retryAt && <Notice text={`You can send again after ${new Date(review.manualLimit.retryAt).toLocaleString()}.`} />}
      {review.lastAttempt && <Text style={s.copy}>Last attempt: {review.lastAttempt.status === 'sent' ? 'Provider accepted; phone delivery unconfirmed' : review.lastAttempt.status} · {new Date(review.lastAttempt.sent_at || review.lastAttempt.created_at).toLocaleString()}</Text>}
    </>}<Notice text={error} error /><View style={s.actions}><Button title="Refresh" icon="refresh-cw" soft disabled={busy} onPress={() => setReload(v => v + 1)} /><Button title={channel === 'sms' ? 'Confirm and send SMS' : 'Confirm and call'} icon={channel === 'sms' ? 'message-square' : 'phone-call'} disabled={!canSend} busy={busy} onPress={send} /></View>
  </Dialog>;
}
