drop function if exists public.crm_add_contact_activity(bigint, text, text, jsonb);
drop function if exists public.crm_save_contact_with_activity(bigint, bigint, jsonb, text);
drop function if exists public.crm_prepare_opportunity_contact();