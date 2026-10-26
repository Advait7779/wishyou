import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  House, UsersThree, UploadSimple, Confetti, PaperPlaneTilt,
  GearSix, SignOut, MagnifyingGlass, Plus, ArrowRight, Cake, Gift, Heart, ChatText,
  PhoneCall, CalendarBlank, Clock, CheckCircle, WarningCircle, Trash, PencilSimple, X, FloppyDisk,
  Sparkle, ArrowUpRight, FileCsv, ArrowClockwise, List, ShieldCheck, Eye, EyeSlash, CaretDown,
} from '@phosphor-icons/react';

const nav = [
  { id: 'dashboard', label: 'Overview', icon: House },
  { id: 'contacts', label: 'Contacts', icon: UsersThree },
  { id: 'settings', label: 'Settings', icon: GearSix },
];

async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, { credentials: 'include', ...options, headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
const json = (method, body) => ({ method, body: JSON.stringify(body) });
const prettyDate = value => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const prettyTime = value => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function Button({ children, variant = 'primary', icon: Icon, ...props }) {
  return <button className={`button button-${variant}`} {...props}>{Icon && <Icon size={18} weight="bold" />}{children}</button>;
}
function Badge({ children, tone = 'neutral' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
function Empty({ icon: Icon = Sparkle, title, body, action }) {
  return <div className="empty"><span className="empty-icon"><Icon size={27} weight="duotone" /></span><h3>{title}</h3><p>{body}</p>{action}</div>;
}
function Field({ label, children, hint }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Notice({ message, onClose }) { return message && <div className={`toast ${message.type === 'error' ? 'toast-error' : ''}`}><span>{message.text}</span><button onClick={onClose} aria-label="Dismiss"><X size={18} /></button></div>; }

function Login({ onLogin, notify }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try { onLogin(await api('/auth/login', json('POST', { email, password }))); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  }
  return <div className="login-wrap"><div className="login-art"><div className="brand brand-light"><span className="brand-mark"><Gift weight="fill" size={21} /></span><span>wishyou<span className="brand-dot">.</span>com</span></div><div className="login-hero"><span className="eyebrow light">A LITTLE JOY, RIGHT ON TIME</span><h1>Make every<br /><em>moment</em> count.</h1><p>Thoughtful birthday and anniversary wishes, beautifully organized in one place.</p><div className="login-orbit orbit-one"><Heart size={30} weight="fill" /></div><div className="login-orbit orbit-two"><Confetti size={28} weight="duotone" /></div><div className="login-orbit orbit-three"><Cake size={23} weight="duotone" /></div></div><div className="login-footer">Made for moments worth celebrating ✦</div></div><div className="login-form-wrap"><form className="login-card" onSubmit={submit}><div className="login-card-heading"><span className="login-small-icon"><Cake size={25} weight="duotone" /></span><span className="login-card-eyebrow">YOUR WISHING SPACE</span><h2>Welcome back</h2><p>Sign in to your wishing dashboard.</p></div><div className="login-fields"><Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="username" /></Field><div className="field"><label htmlFor="login-password">Password</label><div className="password-input"><input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password" /><button type="button" className="password-visibility" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}</button></div></div></div><Button disabled={busy} data-busy={busy} aria-busy={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} /></Button><div className="login-secure"><ShieldCheck size={17} /> Secure admin access</div></form></div></div>;
}

function FailedWishes({ count, items, navigate }) {
  if (!count) return null;
  return <section className="panel" role="status"><div className="panel-heading"><div><span className="eyebrow">NEEDS REVIEW</span><h3>{count.toLocaleString()} greeting{count === 1 ? '' : 's'} failed</h3></div><button className="text-action" onClick={() => navigate('contacts')}>View contacts <ArrowUpRight size={16} /></button></div><div className="celebration-list">{items.map(item => <div className="celebration-item" key={item.id}><span className="avatar"><WarningCircle size={20} /></span><div><strong>{item.contact_name || item.phone}</strong><small>{item.phone} · {item.occasion} {item.channel} · {prettyTime(item.created_at)}</small></div><Badge tone="warm">Failed</Badge></div>)}</div></section>;
}

function Dashboard({ data, greetingUrls, settings, navigate }) {
  const deliveries = data?.deliveries || {};
  const sent = deliveries.sent || 0;
  const greetingCount = greetingUrls.filter(entry => entry.url).length;
  return <div className="page-stack"><div className="welcome-banner"><div className="welcome-text"><span className="eyebrow light">YOUR WISHING SPACE</span><h2>Celebrate the little things.<br /><em>They become the big things.</em></h2><p>Keep every birthday and anniversary close, and every message heartfelt.</p></div><div className="banner-illustration"><div className="orb orb-main"><Confetti size={74} weight="duotone" /></div><div className="orb orb-small"><Heart size={28} weight="fill" /></div><div className="orb orb-star"><Cake size={31} weight="duotone" /></div></div></div><div className="stats-grid"><Stat icon={UsersThree} value={data?.contacts ?? 0} label="Total contacts" tone="orange" /><Stat icon={CalendarBlank} value={data?.todayCount ?? data?.today?.length ?? 0} label="Celebrating today" tone="pink" /><Stat icon={PaperPlaneTilt} value={sent} label="Wishes accepted" tone="purple" /><Stat icon={ChatText} value={greetingCount} label="Greeting URLs" tone="gold" /></div><FailedWishes count={deliveries.failed || 0} items={data?.recentFailures || []} navigate={navigate} /><div className="two-column"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">SPECIAL DAYS</span><h3>Today's celebrations</h3></div><button className="text-action" onClick={() => navigate('contacts')}>View contacts <ArrowUpRight size={16} /></button></div>{data?.today?.length ? <div className="celebration-list">{data.today.slice(0, 3).map(person => <div className="celebration-item" key={person.id}><span className="avatar">{(person.display_name || 'F')[0].toUpperCase()}</span><div><strong>{person.display_name || 'Friend'}</strong><small>{person.phone}</small></div><Badge tone="warm">{person.birthday_today ? 'Birthday' : 'Anniversary'}</Badge></div>)}</div> : <Empty icon={Cake} title="No celebrations today" body="Your special moments will appear here when your contacts are imported." action={<Button variant="soft" icon={UploadSimple} onClick={() => navigate('contacts')}>Import contacts</Button>} />}</section><section className="panel how-panel"><div className="panel-heading"><div><span className="eyebrow">QUICK START</span><h3>Your path to a perfect wish</h3></div></div><div className="steps"><Step number="01" title="Add your people" body="Upload a CSV or Excel file with your contacts and dates." active={Boolean(data?.contacts)} /><Step number="02" title="Add greeting links" body="Save your birthday and anniversary URLs in Settings." active={Boolean(greetingCount)} /><Step number="03" title="Send with a smile" body="Enable automatic wishes in Settings or send to one person from Contacts." active={Boolean(settings?.birthdayEnabled || settings?.anniversaryEnabled || data?.campaigns)} /></div></section></div></div>;
}
function Stat({ icon: Icon, value, label, tone }) { return <div className="stat-card"><span className={`stat-icon stat-${tone}`}><Icon size={24} weight="duotone" /></span><div><strong>{value.toLocaleString()}</strong><span>{label}</span></div><ArrowUpRight size={18} className="stat-arrow" /></div>; }
function Step({ number, title, body, active }) { return <div className="step"><span className={`step-number ${active ? 'done' : ''}`}>{active ? <CheckCircle size={22} weight="fill" /> : number}</span><div><strong>{title}</strong><p>{body}</p></div></div>; }

function Contacts({ data, settings, refresh, notify }) {
  const fileInputRef = useRef(null);
  const uploadControllerRef = useRef(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [result, setResult] = useState(data);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cancelingUpload, setCancelingUpload] = useState(false);
  const [importJob, setImportJob] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dateFormat, setDateFormat] = useState('');
  const completedImportRef = useRef(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { let live = true; if (search.trim() && search.trim().length < 3) { setResult(previous => ({ ...previous, items: [], total: 0, nextCursor: null })); setBusy(false); return () => { live = false; }; } setBusy(true); const timer = setTimeout(() => api(`/contacts?search=${encodeURIComponent(search)}${cursor ? `&before=${cursor}` : ''}`).then(value => { if (live) setResult(value); }).catch(error => notify(error.message, 'error')).finally(() => { if (live) setBusy(false); }), 180); return () => { live = false; clearTimeout(timer); }; }, [cursor, search, refresh]);
  function previousPage() { if (page <= 1) return; setCursor(cursorStack.at(-1) || null); setCursorStack(cursorStack.slice(0, -1)); setPage(page - 1); }
  function nextPage() { if (!result?.nextCursor) return; setCursorStack([...cursorStack, cursor]); setCursor(result.nextCursor); setPage(page + 1); }
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const job = await api('/imports/uploads/latest');
        if (!live) return;
        setImportJob(job);
        if (job?.status === 'completed' && completedImportRef.current !== job.id) {
          completedImportRef.current = job.id;
          if (Date.now() - new Date(job.updatedAt).getTime() < 60000) {
            notify(`Imported ${job.imported.toLocaleString()} contacts${job.skipped ? `; ${job.skipped.toLocaleString()} rows skipped` : ''}.`);
            refresh();
          }
        }
      } catch (error) { if (live) console.error('Import status:', error); }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const columns = result?.dataset?.columns || [];
  async function clear() {
    try { await api('/contacts/clear', json('POST', { confirm: 'CLEAR' })); setConfirmClear(false); setResult(null); notify('Contacts and columns have been cleared.'); refresh(); }
    catch (error) { notify(error.message, 'error'); }
  }
  async function saveEdit() {
    try { await api(`/contacts/${editing.id}`, json('PATCH', { data: editing.data, active: editing.active })); setEditing(null); notify('Contact updated.'); refresh(); }
    catch (error) { notify(error.message, 'error'); }
  }
  async function deleteContact() {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    try {
      await api(`/contacts/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      if (result.items.length === 1 && page > 1) previousPage();
      notify('Contact deleted.');
      refresh();
    } catch (error) { notify(error.message, 'error'); }
    finally { setDeletingBusy(false); }
  }
  async function importFile(file) {
    if (!file || importing) return;
    if (!dateFormat) { notify('Choose the date order before uploading. Excel and ISO dates work with either choice.', 'error'); return; }
    if (result?.dataset && !window.confirm('Replace the current contacts and columns after this file is validated? Past send records will be kept.')) return;
    setImporting(true);
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    try {
      const resumeKey = `wishyou-upload:${file.name}:${file.size}:${file.lastModified}:${dateFormat}`;
      let job;
      const savedId = localStorage.getItem(resumeKey);
      if (savedId) {
        try { job = await api(`/imports/uploads/${savedId}`); }
        catch { localStorage.removeItem(resumeKey); }
      }
      if (!job || job.status === 'failed') {
        job = await api('/imports/uploads', json('POST', { filename: file.name, size: file.size, dateFormat }));
        localStorage.setItem(resumeKey, job.id);
      }
      setImportJob(job);
      if (job.status !== 'uploading') { notify('This file is already being processed.'); return; }
      let offset = job.offset;
      const chunkSize = 16 * 1024 * 1024;
      while (offset < file.size) {
        if (controller.signal.aborted) return;
        const end = Math.min(file.size, offset + chunkSize);
        let uploaded = false;
        for (let attempt = 0; attempt < 4 && !uploaded; attempt++) {
          try {
            job = await api(`/imports/uploads/${job.id}`, { method: 'PATCH', body: file.slice(offset, end),
              headers: { 'content-type': 'application/octet-stream', 'upload-offset': String(offset) }, signal: controller.signal });
            offset = job.offset;
            uploaded = true;
          } catch (error) {
            if (controller.signal.aborted) return;
            const latest = await api(`/imports/uploads/${job.id}`);
            if (latest.offset > offset) { job = latest; offset = latest.offset; uploaded = true; }
            else if (attempt === 3) throw error;
            else await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
          }
        }
        setUploadProgress(Math.round(offset / file.size * 100));
        setImportJob(job);
      }
      if (controller.signal.aborted) return;
      job = await api(`/imports/uploads/${job.id}/complete`, json('POST', {}));
      setImportJob(job);
      localStorage.removeItem(resumeKey);
      notify('Upload complete. Contacts are importing in the background.');
    } catch (error) { if (!controller.signal.aborted) notify(error.message, 'error'); }
    finally { if (uploadControllerRef.current === controller) uploadControllerRef.current = null; setImporting(false); }
  }
  async function cancelUpload() {
    if (cancelingUpload || importJob?.status !== 'uploading') return;
    setCancelingUpload(true);
    uploadControllerRef.current?.abort();
    try {
      await api(`/imports/uploads/${importJob.id}`, { method: 'DELETE' });
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('wishyou-upload:') && localStorage.getItem(key) === importJob.id) localStorage.removeItem(key);
      }
      setImportJob(null);
      setUploadProgress(0);
      notify('Upload canceled.');
    } catch (error) { notify(error.message, 'error'); }
    finally { setCancelingUpload(false); }
  }
  const activeImport = ['uploading', 'queued', 'processing', 'waiting_for_sends'].includes(importJob?.status);
  return (
    <div className="page-stack">
      <Field label="Date order for this file"><select value={dateFormat} onChange={e => setDateFormat(e.target.value)} disabled={importing}><option value="">Choose before uploading</option><option value="DMY">Day / Month / Year (DD/MM/YYYY)</option><option value="MDY">Month / Day / Year (MM/DD/YYYY)</option></select></Field>
      {importJob && <ImportProgress job={importJob} uploadProgress={uploadProgress} onCancel={cancelUpload} canceling={cancelingUpload} />}
      {!result?.dataset ? (
        <Import onChoose={importFile} busy={importing || activeImport} />
      ) : (
        <>
          <div className="section-top"><div><span className="eyebrow">YOUR PEOPLE</span><h2>Contact directory</h2><p>{result.total.toLocaleString()} contacts from {result.dataset.name}</p></div></div>
          <div className="panel table-panel">
          <div className="table-toolbar">
            <div className="search-box"><MagnifyingGlass size={19} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); setCursor(null); setCursorStack([]); }} placeholder="Search 3+ characters in any column…" /></div>
            <div className="table-toolbar-actions">
              <Button variant="ghost" icon={Trash} onClick={() => setConfirmClear(true)}>Clear dataset</Button>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="visually-hidden" aria-label="Choose another contacts file" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; importFile(file); }} />
              <Button icon={UploadSimple} disabled={importing || activeImport} onClick={() => fileInputRef.current?.click()}>{activeImport ? 'Import in progress' : 'Import more'}</Button>
            </div>
          </div>
          <div className="table-scroll"><table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}<th>Status</th><th>Action</th></tr></thead><tbody>{result.items.map(contact => <tr key={contact.id}>{columns.map(column => <td key={column} title={String(contact.data[column] ?? '')}>{String(contact.data[column] ?? '') || '—'}</td>)}<td><Badge tone={contact.active ? 'success' : 'neutral'}>{contact.active ? 'Active' : 'Paused'}</Badge></td><td><div className="row-actions"><button className="row-action" aria-label={`Edit ${contact.display_name || 'contact'}`} title="Edit contact" onClick={() => setEditing(structuredClone(contact))}><PencilSimple size={16} /></button><button className="row-action row-action-sms" aria-label={`Send SMS to ${contact.display_name || 'contact'}`} title="Send SMS" onClick={() => setReviewing({ contact, channel: 'sms' })}><ChatText size={16} /></button><button className="row-action row-action-voice" aria-label={`Call ${contact.display_name || 'contact'}`} title="Send voice call" onClick={() => setReviewing({ contact, channel: 'voice' })}><PhoneCall size={16} /></button><button className="row-action row-action-danger" aria-label={`Delete ${contact.display_name || 'contact'}`} title="Delete contact" onClick={() => setDeleting(contact)}><Trash size={16} /></button></div></td></tr>)}</tbody></table></div>
          {!result.items.length && <Empty icon={MagnifyingGlass} title="No contacts found" body="Try another search or import a new spreadsheet." />}
          <div className="table-footer"><span>{busy ? 'Loading…' : `Showing ${result.items.length} of ${result.total.toLocaleString()} contacts`}</span><div><Button variant="ghost" disabled={page <= 1} onClick={previousPage}>Previous</Button><span className="page-indicator">Page {page}</span><Button variant="ghost" disabled={!result.nextCursor} onClick={nextPage}>Next</Button></div></div>
          </div>
        </>
      )}
      {confirmClear && <Modal title="Clear this dataset?" onClose={() => setConfirmClear(false)}><p className="modal-copy">This removes all contacts, their dynamic columns, and past sends. Your greeting URLs in Settings stay in place.</p><div className="modal-actions"><Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button><Button variant="danger" icon={Trash} onClick={clear}>Clear everything</Button></div></Modal>}
      {deleting && <Modal title="Delete contact?" onClose={deletingBusy ? () => {} : () => setDeleting(null)}><p className="modal-copy">This permanently removes {deleting.display_name || 'this contact'} and all of their delivery records. Any unsent wishes for this contact will be canceled.</p><div className="modal-actions"><Button variant="ghost" disabled={deletingBusy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" icon={Trash} disabled={deletingBusy} onClick={deleteContact}>{deletingBusy ? 'Deleting…' : 'Delete contact'}</Button></div></Modal>}
      {reviewing && <ContactGreetingReview contact={reviewing.contact} initialChannel={reviewing.channel} settings={settings} onClose={() => setReviewing(null)} notify={notify} refresh={refresh} />}
      {editing && <Modal title="Edit contact" onClose={() => setEditing(null)}><div className="form-grid">{columns.map(column => <Field label={column} key={column}><input value={editing.data[column] ?? ''} onChange={e => setEditing({ ...editing, data: { ...editing.data, [column]: e.target.value } })} /></Field>)}</div><label className="check-row"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> Active for wishes</label><div className="modal-actions"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button icon={FloppyDisk} onClick={saveEdit}>Save contact</Button></div></Modal>}
    </div>
  );
}

function ContactGreetingReview({ contact, initialChannel, settings, onClose, notify, refresh }) {
  const [occasion, setOccasion] = useState(contact.birth_date ? 'birthday' : 'anniversary');
  const [channel, setChannel] = useState(initialChannel);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setReview(null);
    setError('');
    setLoading(true);
    api(`/contacts/${contact.id}/greeting-review?occasion=${occasion}&channel=${channel}`)
      .then(value => { if (live) setReview(value); })
      .catch(cause => { if (live) setError(cause.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [contact.id, occasion, channel]);

  const person = review?.contact || contact;
  const occasionDate = occasion === 'birthday' ? person.birth_date : person.anniversary_date;
  const date = occasionDate ? new Date(occasionDate) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not on file';
  const todayParts = new Intl.DateTimeFormat('en-US', { timeZone: settings?.timezone || 'Asia/Kolkata', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const todayMonthDay = `${todayParts.find(part => part.type === 'month')?.value}-${todayParts.find(part => part.type === 'day')?.value}`;
  const isToday = date && !Number.isNaN(date.getTime()) && date.toISOString().slice(5, 10) === todayMonthDay;
  const name = person.display_name || 'Friend';
  const preview = (review?.previewText || '').replace(/\{name\}|\[alp\]/gi, name).replace(/\{phone\}/gi, person.phone);
  const last = review?.lastAttempt;
  const canSend = review?.configured && person.active && occasionDate && !review.pending && !review.mismatchedName && review?.manualLimit?.remaining > 0 && !loading && !sending;

  async function sendGreeting() {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      await api(`/contacts/${person.id}/send-greeting`, json('POST', { occasion, channel }));
      notify(`${channel === 'sms' ? 'SMS' : 'Voice call'} queued for ${name}. Reopen this contact to check the latest provider response.`);
      refresh();
      onClose();
    } catch (cause) {
      setError(cause.message);
      api(`/contacts/${person.id}/greeting-review?occasion=${occasion}&channel=${channel}`).then(setReview).catch(() => {});
    }
    finally { setSending(false); }
  }

  return <Modal title="Review greeting before sending" onClose={sending ? () => {} : onClose} className="greeting-review-modal">
    <div className="form-grid review-selects">
      <Field label="Occasion"><select value={occasion} onChange={event => setOccasion(event.target.value)} disabled={sending}><option value="birthday" disabled={!person.birth_date}>Birthday</option><option value="anniversary" disabled={!person.anniversary_date}>Anniversary</option></select></Field>
      <Field label="Channel"><select value={channel} onChange={event => setChannel(event.target.value)} disabled={sending}><option value="sms">SMS</option><option value="voice">Voice call</option></select></Field>
    </div>
    <div className="review-facts">
      <p><strong>Contact:</strong> {name}</p>
      <p><strong>Recipient:</strong> {person.phone}</p>
      <p><strong>Occasion date:</strong> {dateLabel}</p>
    </div>
    {occasionDate && !isToday && <p className="review-warning">This occasion is not today. Check the date before sending.</p>}
    {!person.active && <p className="review-warning">This contact is paused. Activate them before sending.</p>}
    {loading && <p className="review-note">Loading the saved greeting…</p>}
    {!loading && !review?.configured && !error && <p className="review-warning">No {occasion} {channel === 'sms' ? 'SMS' : 'voice call'} URL is saved in Settings.</p>}
    {review?.pending && <p className="review-warning">A greeting for this contact is already queued or sending.</p>}
    {review?.manualLimit && <p className="review-note">Manual sends available for this number: {review.manualLimit.remaining} of {review.manualLimit.limit} in the last 24 hours.</p>}
    {review?.manualLimit?.remaining === 0 && <p className="review-warning">Manual send limit reached. You can send again after {prettyTime(new Date(review.manualLimit.retryAt))}.</p>}
    {review?.mismatchedName && <p className="review-warning">The saved SMS says “Dear {review.mismatchedName}” for {name}. Replace that name with {'{name}'} in the SMS URL in Settings before sending.</p>}
    {review?.configured && <>
      <div className="review-message"><strong>{channel === 'sms' ? 'SMS message' : 'Voice call preview'}</strong><p>{preview || 'No preview text saved in Settings.'}</p></div>
      {review.providerTemplateId && <p className="review-provider"><strong>Provider template ID:</strong> {review.providerTemplateId}</p>}
      <p className="review-provider"><strong>Provider URL:</strong> {review.providerHost} <span>(credentials hidden)</span></p>
    </>}
    {last && <p className="review-note">Last attempt: {last.provider_accepted ? 'accepted by the provider; phone delivery unconfirmed' : last.status} on {prettyTime(last.sent_at || last.created_at)}.{last.provider_message_id && <> Gateway ID: {last.provider_message_id}.</>}{last.provider_accepted && ' Confirming will send another greeting.'}</p>}
    {error && <p className="review-error" role="alert">{error}</p>}
    <div className="modal-actions"><Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button><Button icon={channel === 'sms' ? ChatText : PhoneCall} onClick={sendGreeting} disabled={!canSend}>{sending ? 'Queuing…' : channel === 'sms' ? 'Confirm and send SMS' : 'Confirm and call'}</Button></div>
  </Modal>;
}

function Modal({ title, children, onClose, className = '' }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => previousFocus?.focus?.();
  }, []);
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return createPortal(<div className="modal-backdrop" onMouseDown={onClose}>
    <div ref={dialogRef} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
      <div className="modal-header"><h3>{title}</h3><button ref={closeRef} onClick={onClose} aria-label="Close"><X size={21} /></button></div>
      {children}
    </div>
  </div>, document.body);
}

function SignOutConfirm({ onCancel, onConfirm, busy }) {
  return <Modal title="Sign out of WishYou?" onClose={busy ? () => {} : onCancel} className="signout-modal">
    <div className="signout-icon"><SignOut size={25} weight="duotone" /></div>
    <p className="modal-copy">Your wishing space will be here when you return. Are you sure you want to sign out?</p>
    <div className="modal-actions">
      <Button variant="ghost" onClick={onCancel} disabled={busy}>Stay here</Button>
      <Button icon={SignOut} onClick={onConfirm} disabled={busy}>{busy ? 'Signing out…' : 'Yes, sign out'}</Button>
    </div>
  </Modal>;
}

function ImportProgress({ job, uploadProgress, onCancel, canceling }) {
  const uploading = job.status === 'uploading';
  const percent = uploading ? Math.max(uploadProgress, Math.round(job.offset / Math.max(job.size, 1) * 100)) : 100;
  const label = {
    uploading: `Uploading ${percent}%`, queued: 'Upload complete — waiting to import',
    processing: `Importing contacts — ${job.processedRows.toLocaleString()} rows checked`,
    waiting_for_sends: 'Import ready — waiting for active sends to finish',
    completed: `Import complete — ${job.imported.toLocaleString()} contacts saved`,
    failed: 'Import failed',
  }[job.status] || job.status;
  return <div className="panel import-progress" role="status"><strong>{label}</strong><span>{job.filename}</span>
    {uploading && <progress value={percent} max="100" aria-label="Upload progress" />}
    {uploading && <Button variant="ghost" disabled={canceling} onClick={onCancel}>{canceling ? 'Canceling…' : 'Cancel upload'}</Button>}
    {job.status === 'processing' && <small>{job.imported.toLocaleString()} valid · {job.skipped.toLocaleString()} skipped</small>}
    {job.error && <p className="review-error">{job.error}</p>}
  </div>;
}

function Import({ onChoose, busy }) {
  return (
    <div className="page-stack">
      <div className="section-top"><div><span className="eyebrow">SPREADSHEET TO WISHES</span><h2>Import your people</h2><p>Choose a CSV or Excel file. Your contacts will be saved automatically.</p></div></div>
      <div className="panel import-upload-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR CONTACT FILE</span><h3>Choose a file</h3></div><FileCsv size={25} className="accent-icon" /></div>
        <label className={`dropzone ${busy ? 'dropzone-busy' : ''}`}><input type="file" accept=".csv,.xlsx" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; onChoose(file); }} /><span className="drop-icon"><UploadSimple size={30} weight="duotone" /></span><strong>{busy ? 'Finish the current upload or import first' : 'Click to browse your files'}</strong><span>CSV or Excel (.xlsx) · Up to 50 GiB · resumable upload</span></label>
        <p className="helper-note">Phone, birthdate, and anniversary columns are detected from the file. Every original column appears in the saved table.</p>
      </div>
    </div>
  );
}
const greetingCards = [
  { occasion: 'birthday', channel: 'sms', title: 'Birthday SMS' },
  { occasion: 'birthday', channel: 'voice', title: 'Birthday Voice Call' },
  { occasion: 'anniversary', channel: 'sms', title: 'Anniversary SMS' },
  { occasion: 'anniversary', channel: 'voice', title: 'Anniversary Voice Call' },
];

function TimeDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.indexOf(String(value)));

  function show() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function choose(index) {
    onChange(options[index]);
    setOpen(false);
    triggerRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const openAbove = below < 160 && above > below;
      const maxHeight = Math.max(44, Math.min(220, options.length * 33 + 10, openAbove ? above : below));
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        top: Math.max(8, Math.min(openAbove ? rect.top - maxHeight - 6 : rect.bottom + 6, window.innerHeight - maxHeight - 8)),
        width: rect.width,
        maxHeight,
      });
    };
    const dismiss = event => {
      if (!triggerRef.current?.contains(event.target) && !listRef.current?.contains(event.target)) setOpen(false);
    };
    const reposition = event => { if (!listRef.current?.contains(event.target)) place(); };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    if (!open || !position || !listRef.current) return;
    const list = listRef.current;
    const option = list.children[activeIndex];
    if (option) list.scrollTop = option.offsetTop - (list.clientHeight - option.clientHeight) / 2;
  }, [open, position, activeIndex]);

  function handleKeyDown(event) {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      setActiveIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Home' && open) { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === 'End' && open) { event.preventDefault(); setActiveIndex(options.length - 1); }
    else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); choose(activeIndex); }
  }

  return <div className="time-dropdown">
    <button type="button" ref={triggerRef} className={`time-dropdown-trigger${open ? ' is-open' : ''}`}
      aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={handleKeyDown}>
      <span>{value}</span><CaretDown size={13} weight="bold" />
    </button>
    {open && position && createPortal(<div id={listId} ref={listRef} className="time-dropdown-menu"
      role="listbox" aria-label={label} style={position}>
      {options.map((option, index) => <div id={`${listId}-${index}`} key={option} role="option"
        aria-selected={option === String(value)} className={`time-dropdown-option${index === activeIndex ? ' is-active' : ''}`}
        onClick={() => choose(index)}>{option}</div>)}
    </div>, document.body)}
  </div>;
}

function ScheduleTimePicker({ value, onChange }) {
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '') || ['09:00', '09', '00'];
  const hour24 = Number(time[1]);
  const hour = hour24 % 12 || 12;
  const minute = time[2];
  const period = hour24 >= 12 ? 'PM' : 'AM';
  function update(nextHour, nextMinute, nextPeriod) {
    const nextHour24 = Number(nextHour) % 12 + (nextPeriod === 'PM' ? 12 : 0);
    onChange(`${String(nextHour24).padStart(2, '0')}:${nextMinute}`);
  }
  return <div className="field schedule-time-field">
    <span>Daily send time</span>
    <div className="schedule-time-controls" role="group" aria-label="Daily send time">
      <TimeDropdown label="Hour" value={String(hour)} options={Array.from({ length: 12 }, (_, index) => String(index + 1))}
        onChange={nextHour => update(nextHour, minute, period)} />
      <span aria-hidden="true">:</span>
      <TimeDropdown label="Minute" value={minute} options={Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))}
        onChange={nextMinute => update(hour, nextMinute, period)} />
      <TimeDropdown label="AM or PM" value={period} options={['AM', 'PM']}
        onChange={nextPeriod => update(hour, minute, nextPeriod)} />
    </div>
  </div>;
}

function Settings({ settings, greetingUrls, refresh, notify }) {
  const [schedule, setSchedule] = useState(settings || {});
  const [cards, setCards] = useState(greetingUrls || []);
  const [savingUrls, setSavingUrls] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => setSchedule(settings || {}), [settings]);
  useEffect(() => setCards(greetingUrls || []), [greetingUrls]);

  const getCard = (occasion, channel) =>
    cards.find(item => item.occasion === occasion && item.channel === channel) ||
    { occasion, channel, url: '', previewText: '' };

  function updateCard(occasion, channel, patch) {
    setCards(previous => greetingCards.map(slot => {
      const current = previous.find(item => item.occasion === slot.occasion && item.channel === slot.channel) ||
        { ...slot, url: '', previewText: '' };
      return slot.occasion === occasion && slot.channel === channel ? { ...current, ...patch } : current;
    }));
  }

  async function saveUrls() {
    setSavingUrls(true);
    try {
      await api('/greeting-urls', json('PUT', { entries: greetingCards.map(({ occasion, channel }) => getCard(occasion, channel)) }));
      notify('Greeting URLs saved.');
      refresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSavingUrls(false);
    }
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    try {
      await api('/settings', json('PUT', { ...schedule, sendTime: schedule.sendTime || '09:00', timezone: schedule.timezone || 'Asia/Kolkata' }));
      notify('Sending schedule saved.');
      refresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSavingSchedule(false);
    }
  }

  return <div className="page-stack">
    <div className="settings-stack">
      <section className="greeting-section">
        <div className="greeting-intro">
          <span className="eyebrow">GREETING LINKS</span>
          <h3>Birthday and anniversary greetings</h3>
          <p>Paste each complete provider URL. Use <code>{'{phone}'}</code> for the recipient and <code>{'{name}'}</code> or <code>[alp]</code> for the contact name in SMS text.</p>
        </div>
        <div className="greeting-grid">
          {greetingCards.map(({ occasion, channel, title }) => {
            const card = getCard(occasion, channel);
            return <div className="panel greeting-card" key={`${occasion}-${channel}`}>
              <div className="greeting-card-title">
                <span className="greeting-card-icon">{channel === 'sms' ? <ChatText size={19} /> : <PhoneCall size={19} />}</span>
                <h4>{title}</h4>
              </div>
              <Field label="Provider URL">
                <textarea value={card.url || ''} onChange={event => updateCard(occasion, channel, { url: event.target.value })}
                  placeholder="https://provider.example/send?phone={phone}&..." rows={4} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
              </Field>
              <Field label="Message or voice script shown in preview">
                <textarea value={card.previewText || ''} onChange={event => updateCard(occasion, channel, { previewText: event.target.value })}
                  placeholder={channel === 'sms' ? 'Happy Birthday, {name}!' : 'Description of the voice recording or script'} rows={3} />
              </Field>
              <p className="greeting-card-help">{channel === 'sms'
                ? 'For accuracy, this text should match the SMS approved with your provider.'
                : 'This description is for preview; the voice provider controls the recording.'}</p>
            </div>;
          })}
        </div>
        <div className="greeting-save"><Button icon={FloppyDisk} onClick={saveUrls} disabled={savingUrls}>{savingUrls ? 'Saving...' : 'Save greeting URLs'}</Button></div>
      </section>
      <section className="panel schedule-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">AUTOMATIC WISHES</span>
            <h3>Choose your send time</h3>
            <p>Choose when automatic birthday and anniversary wishes are sent.</p>
          </div>
          <Clock size={26} className="accent-icon" />
        </div>
        <ScheduleTimePicker value={schedule.sendTime} onChange={sendTime => setSchedule(previous => ({ ...previous, sendTime }))} />
        <div className="form-grid">
          <label className="toggle-row"><span><strong>Automatic birthdays</strong><small>Send on the person's birthday</small></span><input type="checkbox" checked={Boolean(schedule.birthdayEnabled)} onChange={event => setSchedule({ ...schedule, birthdayEnabled: event.target.checked })} /></label>
          <label className="toggle-row"><span><strong>Automatic anniversaries</strong><small>Send on the anniversary date</small></span><input type="checkbox" checked={Boolean(schedule.anniversaryEnabled)} onChange={event => setSchedule({ ...schedule, anniversaryEnabled: event.target.checked })} /></label>
        </div>
        <div className="form-end"><Button icon={FloppyDisk} onClick={saveSchedule} disabled={savingSchedule}>{savingSchedule ? 'Saving...' : 'Save schedule'}</Button></div>
      </section>
    </div>
  </div>;
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [page, setPage] = useState('dashboard');
  const contentRef = useRef(null);
  const [sidebar, setSidebar] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState(null);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState({ dashboard: null, contacts: null, greetingUrls: [], settings: {} });
  useEffect(() => { if (!nav.some(item => item.id === page)) setPage('dashboard'); }, [page]);
  const notify = (text, type = 'success') => { setMessage({ text, type }); setTimeout(() => setMessage(null), 5000); };
  const refresh = () => setTick(value => value + 1);
  const navigate = id => { setPage(id); setSidebar(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!user || !root) return;
    const selector = '.page-intro, .section-top, .welcome-banner, .stat-card, .panel, .greeting-intro';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' });
    const observeNewSections = () => {
      root.querySelectorAll(selector).forEach((element, index) => {
        if (element.classList.contains('is-visible')) return;
        element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 55}ms`);
        element.classList.add('reveal-pending');
        observer.observe(element);
      });
    };
    observeNewSections();
    const changes = new MutationObserver(observeNewSections);
    changes.observe(root, { childList: true, subtree: true });
    return () => { changes.disconnect(); observer.disconnect(); };
  }, [page, user]);
  useEffect(() => { api('/auth/me').then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { if (!user) return; let live = true; Promise.allSettled(['/dashboard', '/contacts?limit=10', '/greeting-urls', '/settings'].map(path => api(path))).then(results => { if (!live) return; const keys = ['dashboard', 'contacts', 'greetingUrls', 'settings']; setData(previous => { const next = { ...previous }; results.forEach((result, i) => { if (result.status === 'fulfilled') next[keys[i]] = result.value; }); return next; }); const failed = results.find(result => result.status === 'rejected'); if (failed) notify(failed.reason.message, 'error'); }); return () => { live = false; }; }, [user, tick]);
  const today = useMemo(() => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), []);
  async function logout() {
    setLoggingOut(true);
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setConfirmLogout(false);
    setLoggingOut(false);
    setUser(null);
  }
  if (user === undefined) return <div className="boot-screen"><span className="brand-mark"><Heart weight="fill" size={23} /></span><span>wishyou<span className="brand-dot">.</span></span></div>;
  if (!user) return <><Login onLogin={setUser} notify={notify} /><Notice message={message} onClose={() => setMessage(null)} /></>;
  const common = { refresh, navigate, notify };
  return <div className="app-shell"><aside className={`sidebar ${sidebar ? 'sidebar-open' : ''}`}><div className="brand"><span className="brand-mark"><Gift weight="fill" size={21} /></span><span>wishyou<span className="brand-dot">.</span>com</span></div><div className="sidebar-caption">YOUR WORKSPACE</div><nav>{nav.map(item => <button key={item.id} className={`nav-link ${page === item.id ? 'selected' : ''}`} onClick={() => navigate(item.id)}><item.icon size={21} weight={page === item.id ? 'fill' : 'regular'} /><span>{item.label}</span>{page === item.id && <span className="nav-indicator" />}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-help"><span><Cake size={21} weight="duotone" /></span><strong>Make it memorable.</strong><p>Every occasion deserves a thoughtful wish.</p><Confetti className="sidebar-help-celebration" size={67} weight="duotone" aria-hidden="true" /></div><button className="logout" onClick={() => setConfirmLogout(true)}><SignOut size={20} /> Sign out</button></div></aside>{sidebar && <div className="mobile-overlay" onClick={() => setSidebar(false)} />}<main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setSidebar(true)} aria-label="Open menu"><List size={23} /></button><div className="breadcrumb">Workspace <span>/</span> <strong>{nav.find(item => item.id === page)?.label}</strong></div></div><div className="topbar-right"><span className="today-label"><CalendarBlank size={17} /> {today}</span><span className="top-avatar">{user.email[0].toUpperCase()}</span></div></header><div key={page} ref={contentRef} className="content" data-page={page}>{page === 'dashboard' && <div className="page-intro"><div><h1>Good to see you!</h1><p>Here is what is happening with your wishes.</p></div><div className="intro-accent"><Sparkle size={20} weight="fill" /> Make someone's day</div></div>}{page === 'dashboard' && <Dashboard data={data.dashboard} greetingUrls={data.greetingUrls} settings={data.settings} navigate={navigate} />}{page === 'contacts' && <Contacts data={data.contacts} settings={data.settings} {...common} />}{page === 'settings' && <Settings settings={data.settings} greetingUrls={data.greetingUrls} refresh={refresh} notify={notify} />}</div></main><Notice message={message} onClose={() => setMessage(null)} />{confirmLogout && <SignOutConfirm onCancel={() => setConfirmLogout(false)} onConfirm={logout} busy={loggingOut} />}</div>;
}
