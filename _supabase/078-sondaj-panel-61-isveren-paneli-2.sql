-- ============================================================
-- 61. adım · İşveren Paneli — 2. paket (93. dosya)
-- ============================================================
-- 1) employer_daily()   sondör ve ekip isimleri KALKTI (S4)
-- 2) employer_kuyular() Kuyular sekmesinin listesi + öngörülen bitiş
-- 3) employer_kuyu()    seçilen kuyunun ayrıntısı: günlük derinlik,
--                       çaplar, azimut/eğim ölçümleri
-- 4) employer_report()  dönemin duruş özeti eklendi (PDF rapor)
--
-- Öngörülen bitiş (S10, S11):
--   koşul         kuyuda en az 10 vardiya
--   ortalama hız  kuyunun sistemdeki metresi ÷ o kuyudaki vardiya
--                 (duruşlu vardiyalar dahil)
--   günlük hız    ortalama hız × projenin günlük vardiya sayısı
--                 (shift_patterns; tanımlı değilse 2)
--   tahmin        bugün + ceil((planlanan − derinlik) ÷ günlük hız)
-- Dosya idempotent.
-- ============================================================

-- 1) günlük rapor: sondör ve ekip yok ---------------------------------
create or replace function public.employer_daily(p_project uuid, p_date date)
returns jsonb language sql stable security definer
set search_path = public, auth as $$
with izin as (select 1 where p_project in (select visible_projects())),
v as (
  select s.id, s.work_date, s.shift, s.paper_no, s.engine_start, s.engine_stop,
         s.operation_note, s.end_state,
         w.code as kuyu, w.current_depth, w.status as kuyu_durum,
         m.code as makine
  from shifts s
  join wells w on w.id = s.well_id
  join machines m on m.id = s.machine_id, izin
  where s.project_id = p_project and s.deleted_at is null
    and shift_report_date(s.work_date, s.shift) = p_date
)
select jsonb_build_object(
  'tarih', p_date,
  'proje', (select coalesce(site_name, name) from projects
             where id = p_project and id in (select visible_projects())),
  'vardiyalar', coalesce((select jsonb_agg(jsonb_build_object(
      'vardiya', v.shift, 'form_no', v.paper_no, 'kuyu', v.kuyu, 'makine', v.makine,
      'kuyu_derinlik', v.current_depth, 'kuyu_durum', v.kuyu_durum,
      'motor_bas', v.engine_start, 'motor_bit', v.engine_stop,
      'not', v.operation_note, 'bitis', v.end_state,
      'metraj', (select coalesce(round(sum(r.meters),2),0) from shift_runs r where r.shift_id = v.id),
      'manevralar', coalesce((select jsonb_agg(jsonb_build_object(
            'sira', r.seq, 'cap', r.diameter, 'baslangic', r.from_m, 'bitis', r.to_m,
            'metre', r.meters) order by r.seq)
          from shift_runs r where r.shift_id = v.id), '[]'::jsonb),
      'durus', employer_vardiya_durus(v.id),
      'olcum', (select count(*) from well_surveys ws
                 where ws.measured_at = p_date and ws.well_id in
                   (select well_id from shifts s2 where s2.id = v.id)))
      order by v.shift)
    from v), '[]'::jsonb),
  'toplam_metraj', coalesce((select round(sum(r.meters),2) from shift_runs r
                             where r.shift_id in (select id from v)), 0)
);
$$;

-- Ortak: projenin kuyuları, vardiya özetiyle ---------------------------
-- son_vardiya: kuyuda en son vardiyanın tarihi. Devam eden kuyu günlerdir
-- boşta bekliyorsa (makine başka kuyuya geçti) ekran bunu tahminin
-- yanında söylüyor — tahmin "bugün yeniden başlarsa" geçerli.
drop function if exists public.employer_kuyu_ozet(uuid, date);
create or replace function public.employer_kuyu_ozet(p_project uuid, p_gun date)
returns table (id uuid, kod text, makine text, planlanan numeric, derinlik numeric,
               durum text, baslama date, bitis date, son_vardiya date, vardiya int, metre numeric,
               hiz numeric, gunluk_vardiya int, kalan numeric, kalan_gun int,
               tahmin date, eksik_vardiya int, tahmin_yok text)
language sql stable security definer set search_path = public as $$
  with gv as (
    select greatest(coalesce((select count(*) from shift_patterns sp
                               where sp.project_id = p_project), 0), 1)::int as n
  ),
  v as (
    select s.well_id, s.id, shift_report_date(s.work_date, s.shift) as tarih, m.code makine,
           coalesce((select sum(r.meters) from shift_runs r where r.shift_id = s.id), 0) metre
      from shifts s join machines m on m.id = s.machine_id
     where s.project_id = p_project and s.deleted_at is null
       and shift_report_date(s.work_date, s.shift) <= p_gun
  ),
  k as (
    select w.id, w.code, w.planned_depth, coalesce(w.current_depth, 0) derinlik, w.status::text durum,
           coalesce(w.started_at, (select min(tarih) from v where v.well_id = w.id)) baslama,
           case when w.status = 'completed'
                then coalesce(w.finished_at, (select max(tarih) from v where v.well_id = w.id)) end bitis,
           (select max(tarih) from v where v.well_id = w.id) son_vardiya,
           (select count(*) from v where v.well_id = w.id)::int vardiya,
           (select coalesce(sum(metre),0) from v where v.well_id = w.id) metre,
           (select makine from v where v.well_id = w.id order by tarih desc limit 1) makine
      from wells w
     where w.project_id = p_project and w.status <> 'cancelled'
  )
  select k.id, k.code, k.makine, k.planned_depth, k.derinlik, k.durum, k.baslama, k.bitis,
         k.son_vardiya, k.vardiya, round(k.metre, 2),
         round(k.metre / nullif(k.vardiya, 0), 2) hiz,
         gv.n,
         case when k.planned_depth is not null then greatest(k.planned_depth - k.derinlik, 0) end kalan,
         case when k.durum = 'drilling' and k.vardiya >= 10 and k.planned_depth is not null
                   and k.metre > 0
              then ceil(greatest(k.planned_depth - k.derinlik, 0) / (k.metre / k.vardiya * gv.n))::int end,
         case when k.durum = 'drilling' and k.vardiya >= 10 and k.planned_depth is not null
                   and k.metre > 0
              then p_gun + ceil(greatest(k.planned_depth - k.derinlik, 0) / (k.metre / k.vardiya * gv.n))::int end,
         case when k.durum = 'drilling' and k.vardiya < 10 then 10 - k.vardiya end,
         /* Tahmin neden yok — ekran bunu yazıyor, boş bırakmıyor */
         case when k.durum <> 'drilling' then null
              when k.vardiya < 10 then 'vardiya'
              when k.planned_depth is null then 'plan'
              when k.metre <= 0 then 'metre' end
    from k, gv;
$$;
revoke all on function public.employer_kuyu_ozet(uuid, date) from public;

-- 2) Kuyular listesi ---------------------------------------------------
create or replace function public.employer_kuyular(p_project uuid, p_gun date default null)
returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
declare v_gun date := coalesce(p_gun, current_date);
begin
  if p_project is null or p_project not in (select visible_projects()) then
    raise exception 'Bu projeyi görme yetkiniz yok';
  end if;
  return jsonb_build_object(
    'bugun', v_gun,
    'esik', 10,
    'kuyular', coalesce((select jsonb_agg(to_jsonb(o) order by
        case o.durum when 'drilling' then 0 when 'planned' then 1 else 2 end,
        case when o.durum = 'completed' then o.bitis end desc nulls last,
        o.kod)
      from employer_kuyu_ozet(p_project, v_gun) o), '[]'::jsonb));
end $$;

-- 3) Kuyu ayrıntısı ----------------------------------------------------
create or replace function public.employer_kuyu(p_well uuid, p_gun date default null)
returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
declare v_gun date := coalesce(p_gun, current_date); v_proje uuid;
begin
  select project_id into v_proje from wells where id = p_well;
  if v_proje is null or v_proje not in (select visible_projects()) then
    raise exception 'Bu kuyuyu görme yetkiniz yok';
  end if;
  return (
    with r as (
      select shift_report_date(s.work_date, s.shift) tarih, ru.diameter, ru.from_m, ru.to_m, ru.meters
        from shift_runs ru join shifts s on s.id = ru.shift_id
       where s.well_id = p_well and s.deleted_at is null
         and shift_report_date(s.work_date, s.shift) <= v_gun
    ),
    g as (select tarih, max(to_m) son from r group by tarih)
    select jsonb_build_object(
      'kuyu', (select to_jsonb(o) from employer_kuyu_ozet(v_proje, v_gun) o where o.id = p_well),
      'acilis', (select acilis_derinlik from wells where id = p_well),
      /* Gün sonu derinliği: o güne kadarki en derin manevra bitişi */
      'seri', coalesce((select jsonb_agg(jsonb_build_object('tarih', g.tarih,
                 'derinlik', round((select max(g2.son) from g g2 where g2.tarih <= g.tarih), 2)) order by g.tarih)
               from g), '[]'::jsonb),
      'caplar', coalesce((select jsonb_agg(jsonb_build_object('cap', diameter, 'bas', bas, 'son', son,
                   'metre', metre) order by bas) from (
                 select diameter, min(from_m) bas, max(to_m) son, round(sum(meters),2) metre
                   from r group by diameter) c), '[]'::jsonb),
      'olcumler', coalesce((select jsonb_agg(jsonb_build_object('derinlik', depth,
                   'azimut', azimuth, 'egim', dip, 'tarih', measured_at) order by depth nulls last)
                 from well_surveys where well_id = p_well and (measured_at is null or measured_at <= v_gun)),
                 '[]'::jsonb),
      'program_azimut', (select azimuth from wells where id = p_well),
      'program_egim', (select dip from wells where id = p_well)
    ));
end $$;

-- 4) Dönem raporu: duruş özeti -----------------------------------------
create or replace function public.employer_durus_donem(p_project uuid, p_from date, p_to date)
returns jsonb language sql stable security definer
set search_path = public, auth as $$
  with v as (
    select s.id, shift_report_date(s.work_date, s.shift) tarih, s.shift::text vardiya, m.code makine,
           s.ilerleme_yok_sebep
      from shifts s join machines m on m.id = s.machine_id
     where s.project_id = p_project and p_project in (select visible_projects())
       and s.deleted_at is null
       and shift_report_date(s.work_date, s.shift) between p_from and p_to
  ),
  a as (
    select a.kind::text tur, a.hours, v.id sid
      from shift_activities a join v on v.id = a.shift_id
     where a.kind in ('ariza','bekleme','tasima','bakim') and coalesce(a.hours,0) > 0
  ),
  d as (select distinct v.* from v where v.id in (select sid from a) or v.ilerleme_yok_sebep is not null)
  select jsonb_build_object(
    'turler', coalesce((select jsonb_agg(jsonb_build_object('tur', tur, 'saat', saat, 'adet', adet) order by saat desc)
                from (select tur, round(sum(hours),1) saat, count(distinct sid) adet from a group by tur) t), '[]'::jsonb),
    'ilerleme_yok', (select count(*) from v where ilerleme_yok_sebep is not null),
    'kayitlar', coalesce((select jsonb_agg(jsonb_build_object('tarih', d.tarih, 'vardiya', d.vardiya,
                  'makine', d.makine, 'kalemler', employer_vardiya_durus(d.id))
                  order by d.tarih, d.vardiya desc) from d), '[]'::jsonb));
$$;

-- 5) dönem raporu: vardiya sayıları eklendi (PDF raporun vardiya ortalaması için) ----------------------------------------
create or replace function public.employer_report(p_project uuid, p_from date, p_to date)
returns jsonb language sql stable security definer
set search_path = public, auth as $$
with izin as (select 1 where p_project in (select visible_projects())),
r as (
  select shift_report_date(s.work_date, s.shift) as rd, s.shift, s.id as shift_id,
         w.id as well_id, w.code as kuyu, w.status as kuyu_durum, w.program,
         m.code as makine, ru.diameter, ru.meters, ru.personnel_id
  from shifts s
  join shift_runs ru on ru.shift_id = s.id
  join wells w on w.id = s.well_id
  join machines m on m.id = s.machine_id, izin
  where s.project_id = p_project and s.deleted_at is null
    and shift_report_date(s.work_date, s.shift) between p_from and p_to
),
gun as (
  select rd, round(sum(meters),2) as metraj,
         round(sum(meters) filter (where kuyu_durum <> 'cancelled'),2) as gecerli,
         count(distinct makine) as makine, count(distinct kuyu) as kuyu
  from r group by rd
),
kuyu as (
  select k.kuyu, k.kuyu_durum, k.program,
         round(sum(k.meters),2) as metraj,
         round(sum(k.meters) filter (where k.diameter = 'PQ'),2) as pq,
         round(sum(k.meters) filter (where k.diameter = 'HQ'),2) as hq,
         round(sum(k.meters) filter (where k.diameter = 'NQ'),2) as nq,
         min(k.rd) as ilk, max(k.rd) as son,
         (select count(*) from well_surveys ws where ws.well_id = k.well_id
            and ws.measured_at between p_from and p_to) as olcum,
         (select current_depth from wells w2 where w2.id = k.well_id) as derinlik
  from r k group by k.kuyu, k.kuyu_durum, k.program, k.well_id
),
mak as (
  select makine, round(sum(meters),2) as metraj, count(distinct rd) as gun,
         round(sum(meters)/nullif(count(distinct rd),0),2) as gunluk_ort
  from r group by makine
),
cap as (select diameter, round(sum(meters),2) as metraj from r group by diameter)
select jsonb_build_object(
  'proje', (select jsonb_build_object('ad', coalesce(site_name, name), 'tam_ad', name,
              'il', city, 'ilce', district) from projects
             where id = p_project and id in (select visible_projects())),
  'donem', jsonb_build_object('baslangic', p_from, 'bitis', p_to),
  'gunler', coalesce((select jsonb_agg(jsonb_build_object('tarih', rd, 'metraj', metraj,
       'gecerli', coalesce(gecerli,0), 'makine', makine, 'kuyu', kuyu) order by rd) from gun), '[]'::jsonb),
  'kuyular', coalesce((select jsonb_agg(jsonb_build_object('kuyu', kuyu, 'durum', kuyu_durum,
       'program', program, 'metraj', metraj, 'pq', coalesce(pq,0), 'hq', coalesce(hq,0),
       'nq', coalesce(nq,0), 'derinlik', derinlik, 'olcum', olcum,
       'ilk', ilk, 'son', son) order by kuyu) from kuyu), '[]'::jsonb),
  'makineler', coalesce((select jsonb_agg(jsonb_build_object('makine', makine, 'metraj', metraj,
       'gun', gun, 'gunluk_ort', gunluk_ort) order by metraj desc) from mak), '[]'::jsonb),
  'caplar', coalesce((select jsonb_agg(jsonb_build_object('cap', diameter, 'metraj', metraj)
       order by metraj desc) from cap), '[]'::jsonb),
  'toplam', jsonb_build_object(
     'metraj',  coalesce((select round(sum(metraj),2) from gun), 0),
     'gecerli', coalesce((select round(sum(gecerli),2) from gun), 0),
     'iptal',   coalesce((select round(sum(metraj) - sum(coalesce(gecerli,0)),2) from gun), 0),
     'gun',     coalesce((select count(*) from gun), 0),
     'kuyu',    coalesce((select count(*) from kuyu), 0),
     'biten',   coalesce((select count(*) from kuyu where kuyu_durum = 'completed'), 0),
     'olcum',   coalesce((select sum(olcum) from kuyu), 0),
     /* Vardiya: metre yapan ve yapmayan hepsi; ortalama metre yapanlara bölünür (A kuralı) */
     'vardiya', (select count(*) from shifts s where s.project_id = p_project and s.deleted_at is null
                   and p_project in (select visible_projects())
                   and shift_report_date(s.work_date, s.shift) between p_from and p_to),
     'uretken', (select count(distinct shift_id) from r where meters > 0))
);
$$;


grant execute on function public.employer_daily(uuid, date) to authenticated;
grant execute on function public.employer_kuyular(uuid, date) to authenticated;
grant execute on function public.employer_kuyu(uuid, date) to authenticated;
grant execute on function public.employer_durus_donem(uuid, date, date) to authenticated;

-- İşveren listesi + dil: yönetim ekranının dil seçicisi için ----------
create or replace function public.employer_dilleri()
returns jsonb language sql stable security definer
set search_path = public, auth as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ad', name, 'dil', lang) order by name), '[]'::jsonb)
    from employers where tenant_id = current_tenant()
     and current_role_of() in ('tenant_admin','platform_admin','manager');
$$;
grant execute on function public.employer_dilleri() to authenticated;

-- Kurulum sınaması -----------------------------------------------------
do $$
begin
  if pg_get_functiondef('public.employer_daily'::regproc) ~* '(sondor|shift_crew|personnel|fuel)' then
    raise exception '61. adım: employer_daily hâlâ kişi ya da mazot döndürüyor';
  end if;
  if (select count(*) from pg_proc where proname in ('employer_kuyular','employer_kuyu','employer_durus_donem')) <> 3 then
    raise exception '61. adım: kuyu fonksiyonları kurulmadı';
  end if;
  raise notice '61. adım: Kuyular, öngörülen bitiş ve PDF rapor fonksiyonları kuruldu; sondör ve ekip kapalı.';
end $$;
