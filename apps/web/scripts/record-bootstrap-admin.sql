-- MANUAL recovery: record an existing administrator as the bootstrap admin.
--
-- Not run by the app or the bootstrap CLI. Use only after inspecting the state
-- and getting the owner's approval (see README "Manual recovery procedure").
--
-- Usage (psql substitutes :'admin_id'):
--   psql -U hachisky -d hachisky -v ON_ERROR_STOP=1 -v admin_id=<user id> -f - \
--     < apps/web/scripts/record-bootstrap-admin.sql
--
-- Everything runs in ONE transaction that takes the SAME advisory lock as the
-- bootstrap CLI (key below, keep it equal to BOOTSTRAP_LOCK_KEY in
-- src/auth/bootstrap-admin.ts). The row is inserted only when ALL hold:
--   - no admin_bootstrap record exists yet;
--   - the given user id has the `admin` role;
--   - that user is the ONLY admin;
--   - that user has exactly ONE credential account.
-- If the insert does not affect exactly one row the block raises an error, the
-- transaction aborts and nothing is written.

BEGIN;

SELECT pg_advisory_xact_lock(7433201190041985002);

SELECT set_config('bootstrap.admin_id', :'admin_id', true);

DO $recover$
DECLARE
  inserted integer;
BEGIN
  INSERT INTO admin_bootstrap (admin_user_id)
  SELECT u.id
  FROM "user" u
  WHERE u.id = current_setting('bootstrap.admin_id')
    AND 'admin' = ANY (string_to_array(u.role, ','))
    AND coalesce(u.banned, false) = false
    AND (
      SELECT count(*) FROM "user" a
      WHERE 'admin' = ANY (string_to_array(a.role, ','))
    ) = 1
    AND (
      SELECT count(*) FROM account c
      WHERE c.user_id = u.id AND c.provider_id = 'credential'
    ) = 1
    AND NOT EXISTS (SELECT 1 FROM admin_bootstrap);

  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> 1 THEN
    RAISE EXCEPTION 'guard failed: % rows inserted, expected 1', inserted;
  END IF;
END
$recover$;

COMMIT;
