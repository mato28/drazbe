-- Append-only enforcement for court-evidence tables (see CLAUDE.md "Integrity").
--
-- bids:      INSERT only. The single permitted UPDATE is filling tsa_token once (NULL -> value)
--            with every other column unchanged (the async TSA worker job).
--            Inserts must continue the per-auction chain: seq = previous + 1 and
--            prev_hash = previous hash (genesis: sha256(auction_id)).
-- audit_log: INSERT only.
--
-- NOTE: a table owner / superuser can still disable triggers. In production the app connects
-- as a role that does not own these tables (see docs/legal-review.md, integrity notes).

CREATE OR REPLACE FUNCTION forbid_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on table "%" is not allowed: table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001', HINT = 'Court-evidence tables can only be inserted into.';
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bids_guard_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tsa_token IS NULL
     AND NEW.tsa_token IS NOT NULL
     AND (to_jsonb(NEW) - 'tsa_token') = (to_jsonb(OLD) - 'tsa_token') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'UPDATE on table "bids" is not allowed: table is append-only'
    USING ERRCODE = 'P0001',
          HINT = 'Only setting tsa_token once (from NULL) is permitted.';
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bids_guard_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_seq  integer;
  last_hash text;
BEGIN
  SELECT b.seq, b.hash INTO last_seq, last_hash
  FROM bids b
  WHERE b.auction_id = NEW.auction_id
  ORDER BY b.seq DESC
  LIMIT 1;

  IF last_seq IS NULL THEN
    last_seq := 0;
    last_hash := encode(sha256(convert_to(NEW.auction_id::text, 'UTF8')), 'hex');
  END IF;

  IF NEW.seq <> last_seq + 1 THEN
    RAISE EXCEPTION 'bid chain broken for auction %: expected seq %, got %',
      NEW.auction_id, last_seq + 1, NEW.seq USING ERRCODE = 'P0001';
  END IF;

  IF NEW.prev_hash <> last_hash THEN
    RAISE EXCEPTION 'bid chain broken for auction %: prev_hash does not match previous bid',
      NEW.auction_id USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bids_chain_before_insert
  BEFORE INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION bids_guard_chain();
--> statement-breakpoint
CREATE TRIGGER bids_append_only_update
  BEFORE UPDATE ON bids
  FOR EACH ROW EXECUTE FUNCTION bids_guard_update();
--> statement-breakpoint
CREATE TRIGGER bids_append_only_delete
  BEFORE DELETE ON bids
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER bids_append_only_truncate
  BEFORE TRUNCATE ON bids
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_log_append_only_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_append_only_mutation();
