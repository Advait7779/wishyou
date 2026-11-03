// Exact dashboard counts are backfilled once and maintained as deliveries change.
export async function setupDeliveryTotals(client) {
  // A concurrent API process can keep writing during a redeploy. Lock rows while
  // backfilling and installing triggers so no status transition is missed.
  await client.query('LOCK TABLE deliveries IN SHARE ROW EXCLUSIVE MODE');
  await client.query(`CREATE TABLE IF NOT EXISTS delivery_totals (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    sent BIGINT NOT NULL DEFAULT 0,
    failed BIGINT NOT NULL DEFAULT 0
  )`);
  const initialized = await client.query('SELECT 1 FROM delivery_totals WHERE id=true');
  if (!initialized.rowCount) {
    await client.query(`INSERT INTO delivery_totals(id,sent,failed)
      SELECT true,COUNT(*) FILTER (WHERE status='sent'),COUNT(*) FILTER (WHERE status='failed') FROM deliveries`);
  }
  await client.query(`CREATE OR REPLACE FUNCTION update_delivery_totals() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='INSERT' THEN
        UPDATE delivery_totals SET
          sent=sent + (CASE WHEN NEW.status='sent' THEN 1 ELSE 0 END),
          failed=failed + (CASE WHEN NEW.status='failed' THEN 1 ELSE 0 END)
        WHERE id=true;
      ELSE
        UPDATE delivery_totals SET
          sent=sent + (CASE WHEN NEW.status='sent' THEN 1 ELSE 0 END) - (CASE WHEN OLD.status='sent' THEN 1 ELSE 0 END),
          failed=failed + (CASE WHEN NEW.status='failed' THEN 1 ELSE 0 END) - (CASE WHEN OLD.status='failed' THEN 1 ELSE 0 END)
        WHERE id=true;
      END IF;
      RETURN NULL;
    END $$`);
  await client.query(`CREATE OR REPLACE FUNCTION subtract_deleted_delivery_totals() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE delivery_totals SET sent=delivery_totals.sent-deleted.sent,
        failed=delivery_totals.failed-deleted.failed
      FROM (SELECT COUNT(*) FILTER (WHERE status='sent') AS sent,
                   COUNT(*) FILTER (WHERE status='failed') AS failed FROM deleted_rows) deleted
      WHERE id=true;
      RETURN NULL;
    END $$`);
  const triggers = [
    ['delivery_totals_insert', `CREATE TRIGGER delivery_totals_insert AFTER INSERT ON deliveries
      FOR EACH ROW WHEN (NEW.status IN ('sent','failed')) EXECUTE FUNCTION update_delivery_totals()`],
    ['delivery_totals_update', `CREATE TRIGGER delivery_totals_update AFTER UPDATE OF status ON deliveries
      FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND
        (OLD.status IN ('sent','failed') OR NEW.status IN ('sent','failed')))
      EXECUTE FUNCTION update_delivery_totals()`],
    ['delivery_totals_delete', `CREATE TRIGGER delivery_totals_delete AFTER DELETE ON deliveries
      REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION subtract_deleted_delivery_totals()`],
  ];
  for (const [name, statement] of triggers) {
    const exists = await client.query("SELECT 1 FROM pg_trigger WHERE tgrelid='deliveries'::regclass AND tgname=$1", [name]);
    if (!exists.rowCount) await client.query(statement);
  }
}
