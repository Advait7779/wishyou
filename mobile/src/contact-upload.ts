import { randomUUID } from 'expo-crypto';
import { File, FileMode, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { api, API_URL, authorizedHeaders, json } from './api';

const chunkSize = 4 * 1024 * 1024;
const maxUploadSize = 50 * 1024 ** 3;

type UploadJob = {
  id: string;
  size: number;
  offset: number;
  dateFormat: string;
  status: string;
  sha256?: string | null;
};

function openSeekableFile(file: File, size: number) {
  const handle = file.open(FileMode.ReadOnly);
  try {
    if (handle.size !== size) throw new Error('The file size changed or cannot be read.');
    handle.offset = 1;
    if (handle.offset !== 1) throw new Error('The file provider does not support seeking.');
    handle.offset = 0;
    return handle;
  } catch (error) {
    handle.close();
    throw error;
  }
}

export async function uploadContactFile(
  asset: { uri: string; name: string; size?: number },
  dateFormat: string,
  signal: AbortSignal,
  onJob: (job: UploadJob) => void,
) {
  let file = new File(asset.uri);
  const size = asset.size || file.size;
  if (!/\.(csv|xlsx)$/i.test(asset.name) || !Number.isSafeInteger(size) || size < 1 || size > maxUploadSize) {
    throw new Error('Choose a CSV or XLSX file up to 50 GiB with a readable size.');
  }

  let handle: ReturnType<File['open']> | undefined;
  let cacheFile: File | undefined;
  try {
    try {
      handle = openSeekableFile(file, size);
    } catch {
      if (Paths.availableDiskSpace < size) {
        throw new Error('This file provider requires a local copy. Free up space or upload from the web panel.');
      }
      cacheFile = new File(Paths.cache, `wishyou-import-${randomUUID()}.tmp`);
      await file.copy(cacheFile);
      if (signal.aborted) return;
      file = cacheFile;
      handle = openSeekableFile(file, size);
    }
    if (signal.aborted) return;
    const sha256 = await file.digest('SHA-256');
    if (signal.aborted) return;

    // Always use the server's current upload, even if the screen has stale state.
    let job: UploadJob | null = await api('/imports/uploads/latest', { signal });
    if (job?.status === 'uploading') {
      onJob(job);
      if (!job.sha256) {
        throw new Error('Resume this earlier upload where it was started, or cancel it to start a verified upload.');
      }
      if (job.sha256 !== sha256 || job.size !== size || job.dateFormat !== dateFormat) {
        throw new Error('Choose the original file and date order to resume, or cancel the unfinished upload.');
      }
    } else {
      job = await api('/imports/uploads', {
        ...json('POST', { filename: asset.name, size, dateFormat, sha256 }), signal,
      });
      if (!job || job.sha256 !== sha256) {
        throw new Error('The server needs the latest update before mobile uploads can continue.');
      }
      onJob(job);
    }

    const endpoint = `/imports/uploads/${job.id}`;
    let offset = job.offset;
    while (offset < size) {
      if (signal.aborted) return;
      const headers = await authorizedHeaders();
      if (signal.aborted) return;
      handle.offset = offset;
      const length = Math.min(chunkSize, size - offset);
      const bytes = await handle.readBytes(length);
      if (signal.aborted) return;
      if (bytes.byteLength !== length) throw new Error('The file changed during upload. Select the original file to resume.');

      const chunk = new AbortController();
      const abort = () => chunk.abort();
      signal.addEventListener('abort', abort);
      const timeout = setTimeout(abort, 120000);
      try {
        const response = await expoFetch(`${API_URL}/api${endpoint}`, {
          method: 'PATCH', body: bytes, signal: chunk.signal,
          headers: {
            ...headers,
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(length),
            'Upload-Offset': String(offset),
            'Upload-SHA256': sha256,
          },
        });
        const next = await response.json().catch(() => null);
        if (!response.ok) throw new Error(next?.error || `Upload failed (${response.status}). Select the original file to resume.`);
        if (next?.offset !== offset + length) throw new Error('Unexpected upload progress. Select the original file to resume.');
        offset = next.offset;
        onJob(next);
      } catch (error) {
        if (!signal.aborted && chunk.signal.aborted) {
          throw new Error('The upload connection timed out. Select the original file to resume.');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
      }
    }
    if (signal.aborted) return;
    const completed = await api(`${endpoint}/complete`, { ...json('POST', {}), signal });
    onJob(completed);
    return completed;
  } finally {
    try {
      handle?.close();
    } finally {
      try { if (cacheFile?.exists) cacheFile.delete(); } catch { /* The operating system can reclaim the cache. */ }
    }
  }
}
