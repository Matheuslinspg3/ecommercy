-- Instalação independente: um projeto Supabase por cliente.
-- Nenhum dado de cliente ou catálogo do Pharmaco está incluído.
create table public.store_installation (
  id boolean primary key default true check(id),
  slug text not null unique, config jsonb not null,
  accepting_orders boolean not null default false,
  check(jsonb_typeof(config) = 'object' and config->>'slug' = slug)
);
create table public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','operator')), active boolean not null default true
);
create table public.products (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, category text not null, description text not null default '',
  image_url text not null default '' check(image_url='' or image_url like 'https://%'),
  price_cents integer not null check(price_cents > 0 and price_cents <= 100000000),
  stock_quantity integer check(stock_quantity >= 0 and stock_quantity <= 1000000),
  reserved_quantity integer not null default 0 check(reserved_quantity >= 0),
  active boolean not null default true,
  sale_class text not null default 'general' check(sale_class in ('general','otc','prescription','controlled')),
  warning text not null default '', options jsonb not null default '[]' check(jsonb_typeof(options)='array'),
  art text not null default 'package' check(art in ('meal','burger','drink','produce','package','care')),
  check(stock_quantity is null or reserved_quantity <= stock_quantity),
  check(sale_class <> 'otc' or length(trim(warning)) > 0)
);
create index products_active_category_idx on public.products(category) where active;
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(), name text not null,
  cep_start text not null check(cep_start ~ '^\d{8}$'), cep_end text not null check(cep_end ~ '^\d{8}$'),
  fee_cents integer not null check(fee_cents >= 0), free_from_cents integer check(free_from_cents >= 0),
  enabled boolean not null default false, check(cep_start <= cep_end)
);
create table public.orders (
  id uuid primary key, number bigint generated always as identity unique,
  fingerprint text not null, token_hash text not null,
  status text not null default 'pending' check(status in ('pending','accepted','preparing','ready_for_pickup','out_for_delivery','completed','canceled')),
  payment_status text not null default 'unpaid' check(payment_status in ('unpaid','received')),
  payment_method text not null default 'on_collection' check(payment_method='on_collection'),
  fulfillment text not null check(fulfillment in ('pickup','delivery')),
  customer jsonb not null, address text not null default '', cep text not null default '',
  lines jsonb not null, subtotal_cents integer not null check(subtotal_cents > 0),
  shipping_cents integer not null check(shipping_cents >= 0),
  total_cents integer not null check(total_cents = subtotal_cents + shipping_cents and total_cents <= 100000000),
  privacy_consent boolean not null check(privacy_consent),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  expires_at timestamptz not null default(now() + interval '30 minutes')
);
create index orders_created_idx on public.orders(created_at desc);
create index orders_expiry_idx on public.orders(expires_at) where status='pending' and payment_status='unpaid';
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id), entity_id uuid, kind text not null,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_events_actor_idx on public.audit_events(actor_id);
create table public.api_rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);

create function public.acquire_rate_limit(p_key text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  if length(p_key) <> 64 then raise exception 'INVALID_KEY'; end if;
  insert into public.api_rate_limits as limits(key,count,expires_at) values(p_key,1,now()+interval '1 minute')
  on conflict(key) do update set
    count = case when limits.expires_at <= now() then 1 else limits.count+1 end,
    expires_at = case when limits.expires_at <= now() then now()+interval '1 minute' else limits.expires_at end
  returning count into v_count;
  return v_count <= 12;
end $$;

create function public.create_order(p_input jsonb, p_token_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_store public.store_installation; v_order public.orders; v_product public.products;
  v_zone public.delivery_zones; v_item jsonb; v_group jsonb; v_choice jsonb;
  v_id uuid := (p_input->>'idempotency_key')::uuid; v_fingerprint text := md5(p_input::text);
  v_qty integer; v_count integer; v_unit bigint; v_subtotal bigint := 0; v_shipping integer := 0;
  v_lines jsonb := '[]'; v_names jsonb; v_selected jsonb; v_method text := p_input->>'fulfillment';
  v_known integer;
begin
  if v_id is null or length(p_token_hash) <> 64 then raise exception 'INVALID_ITEMS'; end if;
  select * into v_store from public.store_installation where id=true for share;
  if not found or p_input->>'store_slug' is distinct from v_store.slug then raise exception 'INSTALLATION_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
  select * into v_order from public.orders where id=v_id for update;
  if found then
    if v_order.fingerprint <> v_fingerprint or v_order.token_hash <> p_token_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(v_order)-'fingerprint'-'token_hash'-'customer'-'address';
  end if;
  if not v_store.accepting_orders then raise exception 'STORE_CLOSED'; end if;
  if jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_array_length(p_input->'items') not between 1 and 40 then raise exception 'INVALID_ITEMS'; end if;
  if coalesce((p_input->>'privacy_consent')::boolean,false)=false or coalesce(length(trim(p_input->>'name')),0) < 2 or coalesce((p_input->>'phone') !~ '^[1-9]\d\d{8,9}$',true) then raise exception 'INVALID_ITEMS'; end if;
  if v_method is null or v_method not in ('pickup','delivery') then raise exception 'DELIVERY_UNAVAILABLE'; end if;
  if not coalesce((v_store.config->'sales'->>(v_method||'_enabled'))::boolean,false) then raise exception 'DELIVERY_UNAVAILABLE'; end if;
  -- O bloqueio em ordem de produto evita ordens opostas entre carrinhos concorrentes.
  for v_item in select value from jsonb_array_elements(p_input->'items') order by value->>'product_id' loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid for update;
    if not found or not v_product.active or v_product.sale_class in ('prescription','controlled') or
      (v_product.sale_class='otc' and (v_store.config->>'segment' <> 'pharmacy' or length(trim(v_product.warning))=0)) then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if v_product.stock_quantity is not null and v_product.stock_quantity-v_product.reserved_quantity < v_qty then raise exception 'INSUFFICIENT_STOCK'; end if;
    v_selected := v_item->'option_ids';
    if jsonb_typeof(v_selected) is distinct from 'array' then raise exception 'INVALID_OPTIONS'; end if;
    if jsonb_array_length(v_selected) > 100 or
      (select count(distinct value) from jsonb_array_elements_text(v_selected)) <> jsonb_array_length(v_selected) then raise exception 'INVALID_OPTIONS'; end if;
    v_unit := v_product.price_cents; v_names := '[]'; v_known := 0;
    for v_group in select value from jsonb_array_elements(v_product.options) loop
      v_count := 0;
      for v_choice in select value from jsonb_array_elements(v_group->'choices') loop
        if v_selected ? (v_choice->>'id') then
          v_count := v_count+1; v_known := v_known+1;
          v_unit := v_unit+(v_choice->>'price_cents')::integer;
          v_names := v_names || jsonb_build_array(v_choice->>'name');
        end if;
      end loop;
      if v_count < (v_group->>'min')::integer or v_count > (v_group->>'max')::integer then raise exception 'INVALID_OPTIONS'; end if;
    end loop;
    if v_known <> jsonb_array_length(v_selected) then raise exception 'INVALID_OPTIONS'; end if;
    v_subtotal := v_subtotal+v_unit*v_qty;
    if v_product.stock_quantity is not null then update public.products set reserved_quantity=reserved_quantity+v_qty where id=v_product.id; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'quantity',v_qty,'unit_cents',v_unit,'options',v_names));
  end loop;
  if v_subtotal < (v_store.config->'sales'->>'min_order_cents')::integer then raise exception 'MINIMUM_ORDER'; end if;
  if v_method='delivery' then
    if coalesce((p_input->>'cep') !~ '^\d{8}$',true) or coalesce(length(trim(p_input->>'address')),0) < 8 then raise exception 'DELIVERY_UNAVAILABLE'; end if;
    select * into v_zone from public.delivery_zones where enabled and (p_input->>'cep') between cep_start and cep_end
      order by cep_end::bigint-cep_start::bigint,id limit 1;
    if not found then raise exception 'DELIVERY_UNAVAILABLE'; end if;
    v_shipping := case when v_zone.free_from_cents is not null and v_subtotal >= v_zone.free_from_cents then 0 else v_zone.fee_cents end;
  end if;
  if v_subtotal+v_shipping > 100000000 then raise exception 'INVALID_ITEMS'; end if;
  if v_subtotal+v_shipping is distinct from (p_input->>'expected_total_cents')::integer then raise exception 'PRICE_CHANGED'; end if;
  insert into public.orders(id,fingerprint,token_hash,fulfillment,customer,address,cep,lines,subtotal_cents,shipping_cents,total_cents,privacy_consent)
  values(v_id,v_fingerprint,p_token_hash,v_method,jsonb_build_object('name',p_input->>'name','phone',p_input->>'phone'),
    coalesce(p_input->>'address',''),coalesce(p_input->>'cep',''),v_lines,v_subtotal,v_shipping,v_subtotal+v_shipping,true)
  returning * into v_order;
  return to_jsonb(v_order)-'fingerprint'-'token_hash'-'customer'-'address';
end $$;

create function public.update_order(p_actor uuid, p_id uuid, p_status text, p_paid boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_order public.orders; v_item record;
begin
  if not exists(select 1 from public.staff_members where user_id=p_actor and active) then raise exception 'STAFF_REQUIRED'; end if;
  select * into v_order from public.orders where id=p_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('completed','canceled') then
    if p_status=v_order.status and (not p_paid or v_order.payment_status='received') then return jsonb_build_object('ok',true); end if;
    raise exception 'INVALID_TRANSITION';
  end if;
  if v_order.status='pending' and v_order.payment_status='unpaid' and v_order.expires_at <= now() and p_status <> 'canceled' then raise exception 'ORDER_EXPIRED'; end if;
  if not (
    p_status=v_order.status or
    (v_order.status='pending' and p_status in ('accepted','canceled')) or
    (v_order.status='accepted' and p_status in ('preparing','canceled')) or
    (v_order.status='preparing' and (p_status='canceled' or (v_order.fulfillment='pickup' and p_status='ready_for_pickup') or (v_order.fulfillment='delivery' and p_status='out_for_delivery'))) or
    (v_order.status in ('ready_for_pickup','out_for_delivery') and p_status='completed')
  ) then raise exception 'INVALID_TRANSITION'; end if;
  if p_status='completed' and v_order.payment_status <> 'received' and not p_paid then raise exception 'PAYMENT_REQUIRED'; end if;
  if p_status in ('canceled','completed') then
    for v_item in select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::integer)::integer quantity
      from jsonb_array_elements(v_order.lines) group by value->>'product_id' order by value->>'product_id' loop
      perform 1 from public.products where id=v_item.product_id for update;
      update public.products set reserved_quantity=reserved_quantity-v_item.quantity,
        stock_quantity=stock_quantity-case when p_status='completed' then v_item.quantity else 0 end
      where id=v_item.product_id and stock_quantity is not null;
    end loop;
  end if;
  update public.orders set status=p_status,payment_status=case when p_paid then 'received' else payment_status end,updated_at=now() where id=p_id;
  insert into public.audit_events(actor_id,entity_id,kind,details) values(p_actor,p_id,'order_updated',jsonb_build_object('from',v_order.status,'to',p_status,'payment_received',p_paid));
  return jsonb_build_object('ok',true);
end $$;

create function public.expire_orders() returns integer
language plpgsql security invoker set search_path='' as $$
declare v_order public.orders; v_item record; v_count integer := 0;
begin
  for v_order in select * from public.orders where status='pending' and payment_status='unpaid' and expires_at <= now() order by id for update skip locked loop
    for v_item in select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::integer)::integer quantity
      from jsonb_array_elements(v_order.lines) group by value->>'product_id' order by value->>'product_id' loop
      perform 1 from public.products where id=v_item.product_id for update;
      update public.products set reserved_quantity=reserved_quantity-v_item.quantity where id=v_item.product_id and stock_quantity is not null;
    end loop;
    update public.orders set status='canceled',updated_at=now() where id=v_order.id;
    insert into public.audit_events(entity_id,kind) values(v_order.id,'order_expired');
    v_count := v_count+1;
  end loop;
  delete from public.api_rate_limits where expires_at < now()-interval '1 day';
  return v_count;
end $$;

create function public.save_product(p_actor uuid, p_product jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_id uuid := (p_product->>'id')::uuid; v_old public.products;
begin
  if not exists(select 1 from public.staff_members where user_id=p_actor and active and role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  select * into v_old from public.products where id=v_id for update;
  if found and v_old.reserved_quantity > 0 and (
    (p_product->>'stock_quantity') is null or v_old.stock_quantity is null or
    (p_product->>'stock_quantity')::integer < v_old.reserved_quantity
  ) then raise exception 'INVALID_STOCK'; end if;
  -- Pedidos de produção sob demanda também precisam manter o modo de estoque até a conclusão.
  if found and (v_old.stock_quantity is null) is distinct from ((p_product->>'stock_quantity') is null) and
    exists(select 1 from public.orders o, jsonb_array_elements(o.lines) l where o.status not in ('completed','canceled') and l->>'product_id'=v_id::text)
  then raise exception 'INVALID_STOCK'; end if;
  insert into public.products(id,slug,name,category,description,image_url,price_cents,stock_quantity,sale_class,warning,options,art,active)
  values(v_id,p_product->>'slug',p_product->>'name',p_product->>'category',p_product->>'description',coalesce(p_product->>'image_url',''),(p_product->>'price_cents')::integer,
    (p_product->>'stock_quantity')::integer,p_product->>'sale_class',p_product->>'warning',p_product->'options',p_product->>'art',(p_product->>'active')::boolean)
  on conflict(id) do update set slug=excluded.slug,name=excluded.name,category=excluded.category,description=excluded.description,image_url=excluded.image_url,
    price_cents=excluded.price_cents,stock_quantity=excluded.stock_quantity,sale_class=excluded.sale_class,warning=excluded.warning,
    options=excluded.options,art=excluded.art,active=excluded.active;
  insert into public.audit_events(actor_id,entity_id,kind) values(p_actor,v_id,'product_saved');
  return jsonb_build_object('id',v_id);
end $$;

create function public.save_settings(p_actor uuid,p_config jsonb,p_accepting boolean,p_zones jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_store public.store_installation; v_zone jsonb;
begin
  if not exists(select 1 from public.staff_members where user_id=p_actor and active and role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  select * into v_store from public.store_installation where id=true for update;
  if not found or v_store.slug is distinct from p_config->>'slug' then raise exception 'INSTALLATION_MISMATCH'; end if;
  update public.store_installation set config=p_config,accepting_orders=p_accepting where id=true;
  delete from public.delivery_zones;
  for v_zone in select value from jsonb_array_elements(p_zones) loop
    insert into public.delivery_zones(id,name,cep_start,cep_end,fee_cents,free_from_cents,enabled)
    values((v_zone->>'id')::uuid,v_zone->>'name',v_zone->>'cep_start',v_zone->>'cep_end',(v_zone->>'fee_cents')::integer,(v_zone->>'free_from_cents')::integer,(v_zone->>'enabled')::boolean);
  end loop;
  insert into public.audit_events(actor_id,kind) values(p_actor,'settings_saved');
  return jsonb_build_object('ok',true);
end $$;

alter table public.store_installation enable row level security;
alter table public.staff_members enable row level security;
alter table public.products enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.orders enable row level security;
alter table public.audit_events enable row level security;
alter table public.api_rate_limits enable row level security;
revoke all on public.store_installation,public.staff_members,public.products,public.delivery_zones,public.orders,public.audit_events,public.api_rate_limits from public,anon,authenticated;
grant usage on schema public to service_role;
grant all on public.store_installation,public.staff_members,public.products,public.delivery_zones,public.orders,public.audit_events,public.api_rate_limits to service_role;
grant usage,select on sequence public.orders_number_seq,public.audit_events_id_seq to service_role;
revoke all on function public.create_order(jsonb,text),public.update_order(uuid,uuid,text,boolean),public.expire_orders(),public.save_product(uuid,jsonb),public.save_settings(uuid,jsonb,boolean,jsonb),public.acquire_rate_limit(text) from public,anon,authenticated;
grant execute on function public.create_order(jsonb,text),public.update_order(uuid,uuid,text,boolean),public.expire_orders(),public.save_product(uuid,jsonb),public.save_settings(uuid,jsonb,boolean,jsonb),public.acquire_rate_limit(text) to service_role;
