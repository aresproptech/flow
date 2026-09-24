begin;

revoke all on function public.crm_save_contact_with_activity(bigint, bigint, jsonb, text)
from public, anon;

grant execute on function public.crm_save_contact_with_activity(bigint, bigint, jsonb, text)
to authenticated, postgres, service_role;

commit;
