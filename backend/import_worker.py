"""Stream large CSV/XLSX contact imports into PostgreSQL with psycopg2 COPY."""

import csv
import io
import itertools
import json
import math
import os
import re
import sqlite3
import sys
import tempfile
import time
import uuid
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg2
from psycopg2 import sql
from openpyxl import load_workbook
from openpyxl.cell.text import Text
from openpyxl.packaging.manifest import Manifest
from openpyxl.reader.excel import ExcelReader
from openpyxl.xml.constants import SHARED_STRINGS, SHEET_MAIN_NS
from openpyxl.xml.functions import fromstring, iterparse


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.environ.get("IMPORT_UPLOAD_DIR", BASE_DIR / "uploads")).resolve()
BATCH_ROWS = 2000
BATCH_BYTES = 8 * 1024 * 1024
MAX_ROW_BYTES = 16 * 1024 * 1024
MAX_EXPANDED_BYTES = int(os.environ.get("IMPORT_MAX_EXPANDED_GB", "500")) * 1024**3
SHARED_STRING_MEMORY_BYTES = int(os.environ.get("IMPORT_SHARED_STRING_MEMORY_MB", "32")) * 1024**2
PHONE_HEADERS = {
    "phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber",
    "whatsapp", "telephone", "tel", "cell", "cellphone", "number", "phoneno",
    "mobileno", "contactno",
}


class DiskStringTable:
    """Random-access shared strings without holding the whole XLSX dictionary in RAM."""

    def __init__(self):
        handle = tempfile.NamedTemporaryFile(prefix="wishyou-strings-", suffix=".sqlite", dir=UPLOAD_DIR, delete=False)
        self.path = Path(handle.name)
        handle.close()
        self.db = sqlite3.connect(self.path)
        self.db.execute("PRAGMA journal_mode=OFF")
        self.db.execute("PRAGMA synchronous=OFF")
        self.db.execute("CREATE TABLE strings (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        self.count = 0

    def append_batch(self, values):
        self.db.executemany("INSERT INTO strings(id,value) VALUES(?,?)",
                            ((self.count + index, value) for index, value in enumerate(values)))
        self.count += len(values)
        self.db.commit()

    def __getitem__(self, index):
        value = self.db.execute("SELECT value FROM strings WHERE id=?", (int(index),)).fetchone()
        if value is None:
            raise IndexError(index)
        return value[0]

    def close(self):
        self.db.close()
        self.path.unlink(missing_ok=True)


class DiskStringExcelReader(ExcelReader):
    def __init__(self, source, table):
        super().__init__(source, read_only=True, data_only=True)
        self.string_table = table

    def read_strings(self):
        part = self.package.find(SHARED_STRINGS)
        if part is None:
            return
        tag = "{" + SHEET_MAIN_NS + "}si"
        values = []
        with self.archive.open(part.PartName[1:]) as source:
            for _, node in iterparse(source):
                if node.tag != tag:
                    continue
                values.append(Text.from_tree(node).content.replace("x005F_", ""))
                node.clear()
                if len(values) >= 2000:
                    self.string_table.append_batch(values)
                    values.clear()
        if values:
            self.string_table.append_batch(values)
        self.shared_strings = self.string_table


def key(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    return str(value)


def normalize_phone(value):
    digits = re.sub(r"\D", "", cell_text(value))
    return digits if 10 <= len(digits) <= 15 else None


def parse_date(value, date_format="DMY"):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = cell_text(value).strip()
    if not text:
        return None
    if re.fullmatch(r"\d{5}(?:\.\d+)?", text):
        serial = float(text)
        if 20000 <= serial <= 90000:
            return (date(1899, 12, 30) + timedelta(days=math.floor(serial))).isoformat()
    match = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", text)
    if match:
        year, month, day = map(int, match.groups())
    else:
        match = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", text)
        if not match:
            return None
        first, second, year = map(int, match.groups())
        day, month = (second, first) if date_format == "MDY" else (first, second)
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def infer_mapping(headers, samples):
    candidates = []
    for index, header in enumerate(headers):
        name = key(header)
        valid = sum(bool(normalize_phone(row[index] if index < len(row) else "")) for row in samples)
        score = (20 if name in PHONE_HEADERS else 10 if re.search(r"phone|mobile|contact|whatsapp|telephone|cell", name) else 0)
        score += valid / max(1, len(samples)) * 10
        if valid:
            candidates.append((score, index))
    if not candidates:
        raise ValueError("Could not identify a phone column. Use Phone, Mobile, or Contact.")
    phone = max(candidates)[1]
    names = [key(header) for header in headers]
    name = next((i for i, value in enumerate(names) if value == "name"), None)
    if name is None:
        name = next((i for i, value in enumerate(names) if re.search(r"(?:full|first|customer|client|contact)name", value)), None)
    birthday = next((i for i, value in enumerate(names) if re.fullmatch(r"dob|dateofbirth|birthdate|birthday|bday", value)), None)
    if birthday is None:
        birthday = next((i for i, value in enumerate(names) if "birth" in value), None)
    anniversary = next((i for i, value in enumerate(names) if re.search(r"anniv|wedding|marriage", value)), None)
    if birthday is None and anniversary is None:
        raise ValueError("Could not identify a birthdate or anniversary date column.")
    date_values = [row[index] for row in samples for index in (birthday, anniversary) if index is not None and index < len(row) and row[index]]
    dmy = sum(bool(parse_date(value, "DMY")) for value in date_values)
    mdy = sum(bool(parse_date(value, "MDY")) for value in date_values)
    return {"name": headers[name] if name is not None else "", "phone": headers[phone],
            "birthday": headers[birthday] if birthday is not None else "",
            "anniversary": headers[anniversary] if anniversary is not None else "",
            "dateFormat": "MDY" if mdy > dmy else "DMY", "countryCode": ""}


def spreadsheet_rows(filename, path):
    if filename.lower().endswith(".csv"):
        csv.field_size_limit(MAX_ROW_BYTES)
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            yield csv.reader(stream)
        return
    if not zipfile.is_zipfile(path):
        raise ValueError("The .xlsx file is not a valid Excel workbook.")
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        expanded = sum(item.file_size for item in members)
        if expanded > MAX_EXPANDED_BYTES:
            raise ValueError("The workbook expands beyond the configured import storage limit.")
        manifest = Manifest.from_tree(fromstring(archive.read("[Content_Types].xml")))
        strings_part = manifest.find(SHARED_STRINGS)
        large_strings = bool(strings_part and
                             archive.getinfo(strings_part.PartName.lstrip("/")).file_size > SHARED_STRING_MEMORY_BYTES)
    with path.open("rb") as source:
        table = DiskStringTable() if large_strings else None
        workbook = None
        reader = None
        try:
            if table:
                reader = DiskStringExcelReader(source, table)
                reader.read()
                workbook = reader.wb
            else:
                workbook = load_workbook(source, read_only=True, data_only=True)
            for sheet in workbook.worksheets:
                yield sheet.iter_rows(values_only=True)
        finally:
            if workbook:
                workbook.close()
            elif reader:
                reader.archive.close()
            if table:
                table.close()


def normalized_row(headers, row, mapping, row_number):
    values = [cell_text(row[i]) if i < len(row) else "" for i in range(len(headers))]
    data = dict(zip(headers, values))
    phone = normalize_phone(data[mapping["phone"]])
    birth_value = data[mapping["birthday"]] if mapping["birthday"] else ""
    anniversary_value = data[mapping["anniversary"]] if mapping["anniversary"] else ""
    birth = parse_date(row[headers.index(mapping["birthday"])], mapping["dateFormat"]) if mapping["birthday"] and birth_value else None
    anniversary = parse_date(row[headers.index(mapping["anniversary"])], mapping["dateFormat"]) if mapping["anniversary"] and anniversary_value else None
    reasons = []
    if not phone:
        reasons.append("Invalid phone number")
    if birth_value and not birth:
        reasons.append("Invalid birthdate")
    if anniversary_value and not anniversary:
        reasons.append("Invalid anniversary date")
    if reasons:
        return None, {"row": row_number, "reasons": reasons}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(payload.encode("utf-8")) > MAX_ROW_BYTES:
        return None, {"row": row_number, "reasons": ["Row exceeds 16 MiB"]}
    return (payload, data[mapping["name"]] if mapping["name"] else "", phone, birth, anniversary), None


def flush_batch(conn, stage, batch, processed, imported, skipped, invalid_sample, job_id):
    if not batch and processed == 0:
        return imported, skipped
    with conn.cursor() as cur:
        if batch:
            stream = io.StringIO()
            writer = csv.writer(stream)
            writer.writerows(batch)
            stream.seek(0)
            cur.copy_expert("COPY import_batch (data,display_name,phone,birth_date,anniversary_date) FROM STDIN WITH (FORMAT CSV)", stream)
            cur.execute(sql.SQL("INSERT INTO {} (data,display_name,phone,birth_date,anniversary_date) "
                                "SELECT DISTINCT ON (phone) data,display_name,phone,birth_date,anniversary_date "
                                "FROM import_batch ORDER BY phone,sequence_no ON CONFLICT (phone) DO NOTHING").format(sql.Identifier(stage)))
            inserted = cur.rowcount
            imported += inserted
            skipped += len(batch) - inserted
            cur.execute("TRUNCATE import_batch")
        cur.execute("UPDATE import_jobs SET processed_rows=%s,imported_count=%s,skipped_count=%s,"
                    "invalid_sample=%s,updated_at=now() WHERE id=%s",
                    (processed, imported, skipped, json.dumps(invalid_sample), job_id))
    conn.commit()
    return imported, skipped


def activate_import(conn, stage, job_id, filename, headers, mapping, imported, skipped):
    while True:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(7286, 1)")
            cur.execute("SELECT 1 FROM deliveries WHERE status IN ('queued','sending') LIMIT 1")
            if cur.fetchone():
                cur.execute("UPDATE import_jobs SET status='waiting_for_sends',updated_at=now() WHERE id=%s", (job_id,))
                conn.commit()
                time.sleep(10)
                continue
            cur.execute("UPDATE import_jobs SET status='processing',updated_at=now() WHERE id=%s", (job_id,))
            # Delivery rows and campaigns remain as the permanent send ledger.
            cur.execute("DELETE FROM datasets")
            cur.execute("INSERT INTO datasets(name,columns,mapping,row_count) VALUES(%s,%s,%s,%s) RETURNING id",
                        (filename, json.dumps(headers), json.dumps(mapping), imported))
            dataset_id = cur.fetchone()[0]
            cur.execute(sql.SQL("INSERT INTO contacts(dataset_id,data,display_name,phone,birth_date,anniversary_date) "
                                "SELECT %s,data,display_name,phone,birth_date,anniversary_date FROM {}").format(sql.Identifier(stage)),
                        (dataset_id,))
            cur.execute(sql.SQL("DROP TABLE {}").format(sql.Identifier(stage)))
            cur.execute("UPDATE import_jobs SET status='completed',imported_count=%s,skipped_count=%s,"
                        "completed_at=now(),updated_at=now() WHERE id=%s", (imported, skipped, job_id))
            cur.execute("INSERT INTO audit_logs(action,details) VALUES('dataset.replaced',%s)",
                        (json.dumps({"datasetId": dataset_id, "imported": imported, "skipped": skipped}),))
        conn.commit()
        return


def run(job_id):
    job_uuid = uuid.UUID(job_id)
    stage = "import_stage_" + job_uuid.hex
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(7287, hashtext(%s))", (job_id,))
            if not cur.fetchone()[0]:
                return
            cur.execute("SELECT filename,file_size,received_bytes,status,date_format FROM import_jobs WHERE id=%s", (job_id,))
            job = cur.fetchone()
            if not job or job[3] not in ("processing", "waiting_for_sends") or job[1] != job[2]:
                return
        conn.commit()
        filename = job[0]
        path = UPLOAD_DIR / (job_id + ".part")
        if not path.is_file() or path.stat().st_size != job[1]:
            raise ValueError("The uploaded file is missing or incomplete.")
        with conn.cursor() as cur:
            cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(stage)))
            cur.execute(sql.SQL("CREATE TABLE {} (data JSONB NOT NULL,display_name TEXT,phone TEXT PRIMARY KEY,"
                                "birth_date DATE,anniversary_date DATE)").format(sql.Identifier(stage)))
            cur.execute("CREATE TEMP TABLE import_batch (sequence_no BIGINT GENERATED ALWAYS AS IDENTITY,data JSONB,display_name TEXT,phone TEXT,birth_date DATE,anniversary_date DATE) ON COMMIT PRESERVE ROWS")
        conn.commit()

        headers = None
        mapping = None
        processed = imported = skipped = 0
        invalid_sample = []
        batch = []
        batch_bytes = 0
        for sheet_rows in spreadsheet_rows(filename, path):
            iterator = iter(sheet_rows)
            try:
                first = next(iterator)
            except StopIteration:
                continue
            sheet_headers = [cell_text(value).strip() for value in first]
            if not sheet_headers or any(not value for value in sheet_headers) or len(set(value.lower() for value in sheet_headers)) != len(sheet_headers):
                raise ValueError("Every sheet needs unique, nonblank column headers.")
            if headers is None:
                headers = sheet_headers
                samples = list(itertools.islice(iterator, 100))
                mapping = infer_mapping(headers, samples)
                mapping["dateFormat"] = job[4]
                rows = itertools.chain(samples, iterator)
                with conn.cursor() as cur:
                    cur.execute("UPDATE import_jobs SET columns=%s,mapping=%s,updated_at=now() WHERE id=%s",
                                (json.dumps(headers), json.dumps(mapping), job_id))
                conn.commit()
            else:
                if sheet_headers != headers:
                    raise ValueError("All sheets must use the same column headers.")
                rows = iterator
            for row_number, row in enumerate(rows, start=2):
                if not any(cell_text(value).strip() for value in row):
                    continue
                processed += 1
                normalized, invalid = normalized_row(headers, row, mapping, row_number)
                if invalid:
                    skipped += 1
                    if len(invalid_sample) < 100:
                        invalid_sample.append(invalid)
                else:
                    batch.append(normalized)
                    batch_bytes += len(normalized[0].encode("utf-8")) + 200
                if len(batch) >= BATCH_ROWS or batch_bytes >= BATCH_BYTES or processed % BATCH_ROWS == 0:
                    imported, skipped = flush_batch(conn, stage, batch, processed, imported, skipped, invalid_sample, job_id)
                    batch = []
                    batch_bytes = 0
        if headers is None:
            raise ValueError("The file has no usable sheet with a header row.")
        imported, skipped = flush_batch(conn, stage, batch, processed, imported, skipped, invalid_sample, job_id)
        if not imported:
            raise ValueError("No valid contacts were found. Check the phone and date columns.")
        activate_import(conn, stage, job_id, filename, headers, mapping, imported, skipped)
        try:
            path.unlink(missing_ok=True)
        except OSError as error:
            print(f"Import succeeded, but the uploaded file could not be removed: {error}", file=sys.stderr, flush=True)
        print(f"Imported {imported} contacts; skipped {skipped} rows.", flush=True)
    except Exception as error:
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(stage)))
            cur.execute("UPDATE import_jobs SET status='failed',error=%s,updated_at=now() WHERE id=%s",
                        (str(error)[:500], job_id))
        conn.commit()
        print(f"Import failed: {error}", file=sys.stderr, flush=True)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python import_worker.py <upload-id>")
    run(sys.argv[1])
