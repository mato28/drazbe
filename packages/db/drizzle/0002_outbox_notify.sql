-- Wake the worker as soon as a notification is enqueued (it also polls as a fallback).
CREATE OR REPLACE FUNCTION notifications_outbox_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('notifications_outbox', '');
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notifications_outbox_after_insert
  AFTER INSERT ON notifications_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION notifications_outbox_notify();
