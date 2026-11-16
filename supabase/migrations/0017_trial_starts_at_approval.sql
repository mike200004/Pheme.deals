-- 0017: the trial starts when an owner is approved, not when they sign up.
-- The waitlist email says "Your 14-day trial starts when you're approved, not
-- now", but getPlanState counted from account_members.created_at, so someone
-- approved two weeks after signing up got no trial at all.
--
-- Set by /api/admin/approve. Owners approved before this (or by flipping the
-- status in the dashboard) have it null and keep counting from created_at.
alter table account_members add column if not exists approved_at timestamptz;
