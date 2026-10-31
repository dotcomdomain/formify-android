-- Playbook levers: deposits that hold a spot, and when drop-off work was ready.
ALTER TABLE checkins ADD COLUMN deposit_cents INTEGER;
ALTER TABLE checkins ADD COLUMN deposit_paid_at INTEGER;
ALTER TABLE checkins ADD COLUMN ready_at INTEGER;
