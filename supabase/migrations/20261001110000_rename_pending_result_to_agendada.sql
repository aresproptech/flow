begin;

update public.opportunity_activities
set
  resultado_text = case
    when lower(btrim(coalesce(resultado_text, ''))) = 'pendiente'
      or lower(btrim(coalesce(metadata ->> 'resultado', ''))) = 'pendiente'
      then 'Agendada'
    else resultado_text
  end
where event_type in ('contact', 'valuation')
  and (
    lower(btrim(coalesce(resultado_text, ''))) = 'pendiente'
    or lower(btrim(coalesce(metadata ->> 'resultado', ''))) = 'pendiente'
  );

update public.opportunity_buyers
set resultado = 'Agendada'
where lower(btrim(coalesce(resultado, ''))) = 'pendiente';

commit;