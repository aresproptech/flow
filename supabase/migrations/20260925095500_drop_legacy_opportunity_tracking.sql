-- Activity history now lives exclusively in opportunity_activities.
drop table if exists public.opportunity_tracking;
drop table if exists public.opportunity_history;