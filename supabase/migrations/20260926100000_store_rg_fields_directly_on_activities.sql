alter table public.opportunity_activities
  add column if not exists hora time without time zone,
  add column if not exists medio text,
  add column if not exists resultado_text text;

update public.opportunity_activities
set
  hora = case
    when metadata ->> 'hora' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
      then (metadata ->> 'hora')::time
    else hora
  end,
  medio = coalesce(nullif(btrim(metadata ->> 'medio'), ''), medio),
  resultado_text = coalesce(nullif(btrim(metadata ->> 'resultado'), ''), resultado_text)
where event_type = 'rg';