begin;

update public.opportunity_activities activity
set
  created_by = coalesce(activity.created_by, activity.assigned_profile_id),
  assigned_profile_id = opportunity.comercial_user_id
from public.opportunities opportunity
where activity.opportunity_id = opportunity.id
  and activity.event_type = 'valuation';

commit;