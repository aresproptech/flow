begin;

alter table public.opportunity_orders
  alter column com_vendedor type numeric(5,2)
    using round(com_vendedor::numeric, 2),
  alter column com_comprador type numeric(5,2)
    using round(com_comprador::numeric, 2);

notify pgrst, 'reload schema';

commit;