-- ============================================================
-- 60. adım · İşveren Paneli — 1. paket (93. dosya)
-- ============================================================
-- 1) employers.lang          işverenin panel dili (tr / en)
-- 2) employer_bootstrap()    + dil
-- 3) employer_daily()        mazot KALKTI, duruş/arıza sebepleri GELDİ
-- 4) employer_report()       mazot KALKTI
-- 5) employer_genel()        Genel durum: iki rakam + A/B/C/D + duruş
--
-- Kurallar (93. dosya):
--   · İşveren mazotu görmez (S2) — fonksiyon cevabında da yok.
--   · Duruş ve arıza sebepleri görünür (S3).
--   · Devam eden hafta/ay ve işin başladığı ilk YARIM hafta/ay
--     ortalamaya girmez.
--   · A: hiç ilerleme olmayan vardiya (metre 0) ortalamaya girmez.
-- Dosya idempotent: iki kez koşulabilir.
-- ============================================================

-- 1) dil ----------------------------------------------------------------
alter table public.employers add column if not exists lang text not null default 'tr';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employers_lang_chk') then
    alter table public.employers add constraint employers_lang_chk check (lang in ('tr','en'));
  end if;
end $$;

-- 2) bootstrap ----------------------------------------------------------
create or replace function public.employer_bootstrap()
returns jsonb language sql stable security definer
set search_path = public, auth as $$
  select jsonb_build_object(
    'firma',   (select name from tenants where id = current_tenant()),
    'isveren', (select e.name from employers e where e.id = current_employer()),
    /* İşveren kullanıcısı: kendi işvereninin dili. Şirket kullanıcısı
       (önizleme): Türkçe. */
    'dil',     coalesce((select e.lang from employers e where e.id = current_employer()), 'tr'),
    'kullanici', (select full_name from profiles where user_id = auth.uid()),
    'projeler', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'ad', coalesce(p.site_name, p.name), 'tam_ad', p.name,
        'il', p.city, 'ilce', p.district,
        'baslangic', p.started_at, 'durum', p.status) order by p.name)
      from projects p where p.id in (select visible_projects())), '[]'::jsonb)
  );
$$;

-- Ortak: bir vardiyanın duruş kalemleri (işverene açık hâli) ----------
-- Arıza: kayıp saat shift_activities'te (program hesaplıyor), türü ve
-- notu o vardiyanın penceresine değen machine_faults satırlarından.
-- Bekleme / taşıma / bakım: shift_activities. İlerleme olmayan vardiya:
-- shifts.ilerleme_yok_sebep. Mazot, kişi, para YOK.
create or replace function public.employer_vardiya_durus(p_shift uuid)
returns jsonb language sql stable security definer
set search_path = public as $$
  with s as (select * from shifts where id = p_shift),
  ak as (
    select a.kind::text as tur, a.sebep, a.hours, a.note
      from shift_activities a where a.shift_id = p_shift
       and a.kind in ('ariza','bekleme','tasima','bakim') and coalesce(a.hours,0) > 0
  ),
  ar as (
    select string_agg(distinct f.kind::text, ',') as turler,
           string_agg(distinct nullif(btrim(f.note),''), ' · ') as notlar
      from machine_faults f, s
     where f.machine_id = s.machine_id
       and f.started_at < upper(vardiya_penceresi(p_shift))
       and coalesce(f.ended_at, 'infinity'::timestamptz) > lower(vardiya_penceresi(p_shift))
  )
  select coalesce(jsonb_agg(x order by x->>'tur'), '[]'::jsonb) from (
    select jsonb_build_object('tur', ak.tur,
             'sebep', case when ak.tur = 'ariza' then (select turler from ar) else ak.sebep end,
             'saat', round(ak.hours, 1),
             'not', case when ak.tur = 'ariza' then (select notlar from ar)
                         else nullif(btrim(ak.note),'') end) as x
      from ak
    union all
    select jsonb_build_object('tur', 'ilerleme_yok', 'sebep', s.ilerleme_yok_sebep,
             'saat', null, 'not', nullif(btrim(s.ilerleme_yok_not),''))
      from s where s.ilerleme_yok_sebep is not null
  ) q;
$$;
revoke all on function public.employer_vardiya_durus(uuid) from public;

-- 3) günlük rapor ------------------------------------------------------
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
            'metre', r.meters, 'sondor', pe.full_name) order by r.seq)
          from shift_runs r left join personnel pe on pe.id = r.personnel_id
          where r.shift_id = v.id), '[]'::jsonb),
      'ekip', coalesce((select jsonb_agg(pe.full_name order by pe.full_name)
          from shift_crew sc join personnel pe on pe.id = sc.personnel_id
          where sc.shift_id = v.id), '[]'::jsonb),
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

-- 4) dönem raporu: mazot kalktı ----------------------------------------
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
     'olcum',   coalesce((select sum(olcum) from kuyu), 0))
);
$$;

-- 5) Genel durum -------------------------------------------------------
create or replace function public.employer_genel(p_project uuid, p_gun date default null)
returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
declare
  v_bugun date := coalesce(p_gun, current_date);
  v_ilk date; v_son date;
  v jsonb;
begin
  if p_project is null or p_project not in (select visible_projects()) then
    raise exception 'Bu projeyi görme yetkiniz yok';
  end if;

  /* Vardiya başına metre — bütün hesapların kaynağı. Bugünden sonrası
     (ileri tarihli yanlış kayıt) sayılmıyor.
     Duruşlu vardiya: kayıp saati olan, ilerleme olmayan ya da hiç metre
     yapmayan vardiya. Grafikte kırmızı. */
  select min(shift_report_date(s.work_date, s.shift)), max(shift_report_date(s.work_date, s.shift))
    into v_ilk, v_son
    from shifts s
   where s.project_id = p_project and s.deleted_at is null
     and shift_report_date(s.work_date, s.shift) <= v_bugun;

  with
  _eg_v as materialized (
    select y.*, (y.kayip > 0 or y.metre <= 0 or y.ilerleme_yok) as durus from (
      select s.id, m.code makine, shift_report_date(s.work_date, s.shift) tarih, s.shift::text vardiya,
             coalesce((select sum(r.meters) from shift_runs r where r.shift_id = s.id), 0) metre,
             coalesce((select sum(a.hours) from shift_activities a where a.shift_id = s.id
                        and a.kind in ('ariza','bekleme','tasima','bakim')), 0) kayip,
             (s.ilerleme_yok_sebep is not null) ilerleme_yok
        from shifts s join machines m on m.id = s.machine_id
       where s.project_id = p_project and s.deleted_at is null
         and shift_report_date(s.work_date, s.shift) <= v_bugun) y
  ),
  kuyu as (
    select status, current_depth, planned_depth from wells
     where project_id = p_project and status <> 'cancelled'
  ),
  mak as (
    select makine, sum(metre) metre, count(*) vardiya,
           count(*) filter (where metre > 0) uretken,
           count(*) filter (where durus) duruslu
      from _eg_v group by makine
  ),
  hafta as (
    select date_trunc('week', tarih)::date bas, sum(metre) metre, count(*) vardiya
      from _eg_v group by 1
  ),
  hafta2 as (
    select h.*, case
        when v_bugun between h.bas and h.bas + 6 then 'devam'
        when h.bas = date_trunc('week', v_ilk)::date and v_ilk > h.bas then 'ilk_yarim'
        else 'kapali' end durum
      from hafta h
  ),
  ay as (
    select date_trunc('month', tarih)::date bas, sum(metre) metre, count(*) vardiya,
           count(*) filter (where metre > 0) uretken
      from _eg_v group by 1
  ),
  ay2 as (
    select a.*, case
        when date_trunc('month', v_bugun)::date = a.bas then 'devam'
        when a.bas = date_trunc('month', v_ilk)::date and v_ilk > a.bas then 'ilk_yarim'
        else 'kapali' end durum
      from ay a
  ),
  gun as (
    select tarih, sum(metre) metre, sum(sum(metre)) over (order by tarih) birikimli
      from _eg_v group by tarih
  ),
  dur as (
    select a.kind::text tur, a.sebep, a.hours, s.id sid, x.tarih, x.vardiya, x.makine
      from shift_activities a
      join shifts s on s.id = a.shift_id
      join _eg_v x on x.id = s.id
     where a.kind in ('ariza','bekleme','tasima','bakim') and coalesce(a.hours,0) > 0
       and x.tarih > v_bugun - 30
  )
  select jsonb_build_object(
    'bugun', v_bugun,
    'ilk', v_ilk, 'son', v_son,
    'ozet', jsonb_build_object(
       'delinen',     coalesce((select round(sum(current_depth),2) from kuyu), 0),
       'planlanan',   coalesce((select round(sum(planned_depth),2) from kuyu), 0),
       'kuyu',        (select count(*) from kuyu),
       'teslim',      (select count(*) from kuyu where status = 'completed'),
       'devam',       (select count(*) from kuyu where status = 'drilling'),
       'son_vardiya', (select jsonb_build_object('tarih', tarih, 'vardiya', vardiya)
                         from _eg_v order by tarih desc, vardiya desc limit 1)),
    /* A — makine başı vardiya ortalaması */
    'a', jsonb_build_object(
       'ortalama', (select round(sum(metre)/nullif(count(*) filter (where metre > 0),0), 2) from _eg_v),
       'vardiya',  (select count(*) from _eg_v),
       'makineler', coalesce((select jsonb_agg(jsonb_build_object(
           'makine', k.makine, 'metre', round(k.metre,2), 'vardiya', k.vardiya,
           'uretken', k.uretken, 'duruslu', k.duruslu,
           'ortalama', round(k.metre/nullif(k.uretken,0), 2),
           'enbuyuk', (select round(max(metre),2) from _eg_v where makine = k.makine and metre > 0),
           'enkucuk', (select round(min(metre),2) from _eg_v where makine = k.makine and metre > 0),
           /* son 60 vardiya, eskiden yeniye */
           'son', (select coalesce(jsonb_agg(jsonb_build_object(
                     'tarih', y.tarih, 'vardiya', y.vardiya, 'metre', round(y.metre,2),
                     'durus', case when y.durus then employer_vardiya_durus(y.id) else null end)
                     order by y.tarih, y.vardiya desc), '[]'::jsonb)
                   from (select * from _eg_v where makine = k.makine
                          order by tarih desc, vardiya asc limit 60) y))
           order by k.makine) from mak k), '[]'::jsonb)),
    /* B — haftalık */
    'b', jsonb_build_object(
       'ortalama', (select round(avg(metre),2) from hafta2 where durum = 'kapali'),
       'haftalar', coalesce((select jsonb_agg(jsonb_build_object(
           'bas', bas, 'metre', round(metre,2), 'vardiya', vardiya, 'durum', durum) order by bas)
         from hafta2), '[]'::jsonb)),
    /* C — aylık */
    'c', jsonb_build_object(
       'ortalama', (select round(avg(metre),2) from ay2 where durum = 'kapali'),
       'aylar', coalesce((select jsonb_agg(jsonb_build_object(
           'ay', to_char(bas,'YYYY-MM'), 'metre', round(metre,2), 'vardiya', vardiya,
           'vardiya_ort', round(metre/nullif(uretken,0),2), 'durum', durum) order by bas)
         from ay2), '[]'::jsonb)),
    /* D — toplam: takvim günü ilk vardiyadan son vardiyaya */
    'd', jsonb_build_object(
       'toplam',   (select round(sum(metre),2) from _eg_v),
       'gun',      case when v_ilk is null then 0 else (v_son - v_ilk) + 1 end,
       'gunluk',   (select round(sum(metre) / nullif((v_son - v_ilk) + 1, 0), 2) from _eg_v),
       'vardiya_ort', (select round(sum(metre)/nullif(count(*) filter (where metre > 0),0), 2) from _eg_v),
       'plan',     coalesce((select commit_meters from projects where id = p_project),
                            (select round(sum(planned_depth),2) from kuyu)),
       'gunler',   coalesce((select jsonb_agg(jsonb_build_object(
           'tarih', g.tarih, 'metre', round(g.metre,2),
           'birikimli', round(g.birikimli, 2)) order by g.tarih)
         from gun g), '[]'::jsonb)),
    /* Duruş — son 30 gün */
    'durus', jsonb_build_object(
       'bas', v_bugun - 29, 'bit', v_bugun,
       'turler', coalesce((select jsonb_agg(jsonb_build_object('tur', tur, 'saat', saat, 'adet', adet)
                   order by saat desc) from (
                     select tur, round(sum(hours),1) saat, count(distinct sid) adet from dur group by tur) t),
                 '[]'::jsonb),
       'ilerleme_yok', (select count(*) from _eg_v x where x.ilerleme_yok and x.tarih > v_bugun - 30),
       'son', coalesce((select jsonb_agg(jsonb_build_object(
                  'tarih', q.tarih, 'vardiya', q.vardiya, 'makine', q.makine,
                  'kalemler', employer_vardiya_durus(q.sid)) order by q.tarih desc, q.vardiya)
                from (select distinct sid, tarih, vardiya, makine from dur
                       order by tarih desc, vardiya limit 8) q), '[]'::jsonb))
  ) into v;
  return v;
end $$;

grant execute on function public.employer_genel(uuid, date) to authenticated;
grant execute on function public.employer_daily(uuid, date) to authenticated;
grant execute on function public.employer_report(uuid, date, date) to authenticated;
grant execute on function public.employer_bootstrap() to authenticated;

-- İşveren adı/dil düzenleme: save_employer'a dokunmadan ayrı küçük fonksiyon
create or replace function public.employer_dil_ayarla(p_employer uuid, p_dil text)
returns boolean language plpgsql security definer
set search_path = public, auth as $$
begin
  if current_role_of() not in ('tenant_admin','platform_admin','manager') then
    raise exception 'Bu işlemi yalnızca yönetici yapabilir';
  end if;
  if p_dil not in ('tr','en') then raise exception 'Dil tr ya da en olmalı'; end if;
  update employers set lang = p_dil where id = p_employer and tenant_id = current_tenant();
  if not found then raise exception 'İşveren bulunamadı'; end if;
  return true;
end $$;
grant execute on function public.employer_dil_ayarla(uuid, text) to authenticated;

-- Kurulum sınaması -----------------------------------------------------
do $$
declare r jsonb;
begin
  if (select count(*) from pg_proc where proname = 'employer_genel') <> 1 then
    raise exception '60. adım: employer_genel kurulmadı';
  end if;
  if pg_get_functiondef('public.employer_daily'::regproc) ilike '%fuel%'
     or pg_get_functiondef('public.employer_report'::regproc) ilike '%fuel%' then
    raise exception '60. adım: işveren fonksiyonlarında mazot kaldı';
  end if;
  raise notice '60. adım: işveren paneli fonksiyonları kuruldu, mazot kapalı.';
end $$;
