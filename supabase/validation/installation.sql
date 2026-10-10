-- Leitura, sem revelar tokens, credenciais ou dados de clientes.
select slug, accepting_orders, config->>'segment' segment from public.store_installation;
select relname object,relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and relname in ('store_installation','staff_members','products','delivery_zones','orders','audit_events','api_rate_limits');
select role_name,function_name,has_function_privilege(role_name,function_name,'execute') allowed
from (values('anon'),('authenticated')) r(role_name)
cross join (values('public.create_order(jsonb,text)'),('public.save_product(uuid,jsonb)'),('public.save_settings(uuid,jsonb,boolean,jsonb)'),('public.update_order(uuid,uuid,text,boolean)'),('public.expire_orders()')) f(function_name);
