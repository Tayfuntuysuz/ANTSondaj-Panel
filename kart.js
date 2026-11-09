/* ============================================================
   VARDİYA KARTI — tek kaynak, iki ekran
   ============================================================
   63. dosya · Tayfun: "Ben vardiyayı tek seferde görmek istediğim zaman
   göremiyorum."

   Hem saha uygulaması (index.html) hem yönetici paneli (panel.html) bu
   dosyayı yükler. İki ayrı kart yazılmadı: biri düzeltilip diğeri
   unutulduğunda aynı vardiya iki yerde iki türlü görünürdü.

   Bağımsız: kendi biçimleyicileri var, app-shell'e ya da index.html'in
   içindeki yardımcılara dayanmıyor.

   Veri: vardiya_karti(p_shift) — SALT OKUMA. Kart açmak kaydı
   açmıyor, kilit denetimi çalıştırmıyor, iz bırakmıyor.
   ============================================================ */
window.VKART = (function(){
"use strict";

function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(c){
  return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); }
function tl(n, d){ d = (d===undefined?2:d);
  return Number(n||0).toLocaleString("tr-TR",
    {minimumFractionDigits:d, maximumFractionDigits:d}); }
function trd(s){ if(!s) return "—";
  var p = String(s).slice(0,10).split("-"); return p[2]+"."+p[1]+"."+p[0]; }
function saat(s){ return s ? String(s).slice(0,5) : "—"; }
function anTarih(s){
  if(!s) return "—";
  var t = String(s);
  return trd(t.slice(0,10)) + (t.length > 11 ? " " + t.slice(11,16) : "");
}

var GOREV = {formen:"Formen", yardimci:"Yardımcı personel", sondor:"Sondör", sondor_yardimcisi:"Sondör yardımcısı",
  alt_eleman:"İşçi", sofor:"Şoför", santiye_sefi:"Şantiye şefi",
  destek:"Destek", diger:"Diğer"};
var BEKLEME_AD = {su:"Su", musteri:"Müşteri", malzeme:"Malzeme / parça",
  hava:"Hava", yol:"Yol / erişim", diger:"Diğer", ariza:"Arıza",
  bekleme:"Bekleme", nakliye:"Nakliye", bakim:"Bakım"};
/* 53. adımda `metraj` ve `manevra` eklendi: manevra_degistir() artık
   metraj değişikliğini de ize yazıyor. Önceden metraj izsiz
   değişiyordu. */
var DEGISEN_AD = {tarih:"Tarih", vardiya:"Vardiya", mazot:"Mazot",
  form_no:"Form no", kuyu:"Kuyu", kuyu_durumu:"Kuyu durumu",
  metraj:"Metraj", manevra:"Manevra"};
var KUYU_DURUM = {kuyu_sonu:"Kuyu sonu", kuyu_iptali:"Kuyu iptali"};

/* Bir bölüm: içi boşsa HİÇ çıkmıyor. "ARIZA —" satırı ekranda yer
   kaplamasın; panelin başka yerlerindeki kuralla aynı. */
function bolum(baslik, ic){
  if(!ic) return "";
  return '<div class="vk-bol"><div class="vk-bas">' + esc(baslik) + '</div>' +
         '<div class="vk-ic">' + ic + '</div></div>';
}
function satirlar(liste){ return liste.filter(Boolean).join(""); }

/* ------------------------------------------------------------
   Bölüm gövdeleri AYRI fonksiyonlar.
   Sebebi: düzeltme ekranı (A2) bunların bir kısmını tek başına
   çiziyor. İki yere kopyalanırsa biri düzeltilip öteki unutulur —
   bu dosyanın var olma sebebi tam olarak o. */
function arizaIc(d){
  return (d.arizalar || []).map(function(a){
    return '<div class="vk-sat"><span>' + esc(a.tur || "") + '</span><span>' +
           anTarih(a.bas) + (a.bit ? " → " + anTarih(a.bit) : " → açık") +
           '</span></div>' +
           (a["not"] ? '<div class="vk-kucuk">' + esc(a["not"]) + '</div>' : ''); }).join("");
}
/* Bekleme: veride saat ARALIĞI yok, yalnız süre var. */
function beklemeIc(d){
  return (d.beklemeler || []).map(function(b){
    return '<div class="vk-sat"><span>' +
           esc(BEKLEME_AD[b.sebep] || BEKLEME_AD[b.tur] || b.tur || "") +
           (b.otomatik ? ' <span class="vk-kucuk">(kendiliğinden)</span>' : '') +
           '</span><span>' + tl(b.saat, 1) + ' saat</span></div>' +
           (b["not"] ? '<div class="vk-kucuk">' + esc(b["not"]) + '</div>' : ''); }).join("");
}
function malzemeIc(d){
  return (d.malzeme || []).map(function(m){
    return '<div class="vk-sat"><span>' + esc(m.ad) +
           (m.kuyuda_kaldi ? ' <span class="vk-kucuk">kuyuda kaldı</span>' : '') +
           '</span><span>' + tl(m.miktar, 0) + ' ' + esc(m.birim || "") +
           '</span></div>'; }).join("");
}
/* Ölçüm: KUYU + TARİH bazlı, vardiyaya bağlı değil. */
function olcumIc(d){
  return (d.gun_olcumleri || []).map(function(o){
    return '<div class="vk-sat"><span>' + tl(o.derinlik) + ' m</span><span>' +
           (o.azimut == null ? '—' : 'azimut ' + tl(o.azimut,1) + '°') +
           (o.egim == null ? '' : ' · eğim ' + tl(o.egim,1) + '°') +
           '</span></div>'; }).join("");
}
/* Gider: PROJE + TARİH bazlı, vardiyaya bağlı değil. */
function giderIc(d){
  return (d.gun_giderleri || []).map(function(g){
    return '<div class="vk-sat"><span>' + esc(g.kalem || "—") +
           (g.aciklama ? ' <span class="vk-kucuk">' + esc(g.aciklama) + '</span>' : '') +
           '</span><span>' + tl(g.tutar, 0) + '</span></div>'; }).join("");
}

function izIc(d){
  return (d.duzeltmeler || []).map(function(x){
    var deg = x.degisenler || {};
    var liste = Object.keys(deg).map(function(k){
      var v = deg[k] || {};
      /* Manevra listesi tek satıra sığmaz; kaç satırdan kaça gittiği
         yazılıyor, metrenin rakamını metraj satırı veriyor. */
      if(k === "manevra"){
        return "Manevra: " + (v.eski || []).length + " satır → " +
               (v.yeni || []).length + " satır";
      }
      if(k === "metraj"){
        return "Metraj: " + tl(v.eski) + " m → " + tl(v.yeni) + " m";
      }
      return (DEGISEN_AD[k] || k) + ": " + esc(String(v.eski == null ? "—" : v.eski)) +
             " → " + esc(String(v.yeni == null ? "—" : v.yeni)); }).join(" · ");
    return '<div class="vk-sat"><span>' + anTarih(x.ne_zaman) +
           (x.kim ? ' · ' + esc(x.kim) : '') + '</span></div>' +
           (liste ? '<div class="vk-kucuk">' + liste + '</div>' : ''); }).join("");
}
/* 53. adımdan sonra METRAJ da iz bırakıyor. İzin KAPSAMADIĞI alanlar
   yazılmaya devam ediyor: kullanıcı değişmemiş sanmasın. */
function izNotu(d){
  return (d.duzeltmeler || []).length
    ? '<div class="vk-kucuk">İz şu alanları tutuyor: tarih, vardiya, mazot, ' +
      'form no, kuyu, kuyu durumu ve metraj. Ekip, malzeme ve kontrol ' +
      'listesi değişikliği iz bırakmıyor.</div>' : "";
}

function ciz(d){
  if(!d) return '<div class="vk-kart"><div class="vk-bos">Vardiya bulunamadı.</div></div>';

  var ust =
    '<div class="vk-ust">' +
      '<div><b>' + esc(d.kuyu || "kuyu yok") + '</b> · ' + trd(d.tarih) +
        ' · ' + esc(d.vardiya || "") + ' · ' + esc(d.makine || "") +
        (d.fis_no ? ' · form ' + esc(d.fis_no) : '') + '</div>' +
      '<div class="vk-metraj">' + tl(d.metraj) + ' m</div>' +
    '</div>';

  /* ---- ekip: sondör önce, şef en sonda ayrı satır (54. dosya) ---- */
  var ekip = (d.ekip || []).map(function(k){
    return '<div class="vk-sat"><span>' + esc(GOREV[k.gorev] || k.gorev) +
           '</span><span>' + esc(k.ad) + '</span></div>'; }).join("");
  if(d.sef){
    ekip += '<div class="vk-sat"><span>Şantiye şefi</span><span>' +
            esc(d.sef) + '</span></div>';
  }

  /* ---- motor ---- */
  var motor = (d.motor_bas || d.motor_bit)
    ? saat(d.motor_bas) + " – " + saat(d.motor_bit) : "";

  /* ---- manevralar ---- */
  var mv = (d.manevralar || []).length
    ? '<table class="vk-tbl"><thead><tr><th>Çap</th><th>Başlangıç</th>' +
      '<th>Bitiş</th><th>Metre</th></tr></thead><tbody>' +
      d.manevralar.map(function(r){
        return '<tr><td>' + esc(r.cap) + '</td><td class="s">' + tl(r.from_m) +
               '</td><td class="s">' + tl(r.to_m) + '</td><td class="s"><b>' +
               tl(r.metre) + '</b></td></tr>'; }).join("") +
      '</tbody></table>'
    : "";

  /* ---- vardiya açıklaması (48. adım · 53. adımda her vardiyaya açıldı)
     Aynı alan iki şey anlatıyor ve hangisi olduğunu METRAJ söylüyor:
     metraj sıfırsa "ilerleme olmadı", sıfır değilse "vardiyada şu da
     yapıldı". İkisini aynı cümleyle yazmak yanlış olurdu. */
  var iyMetraj = Number(d.metraj || 0);
  var iy = d.ilerleme_yok
    ? '<div class="vk-uy">' + esc(d.ilerleme_yok.ad || d.ilerleme_yok.sebep) +
      (d.ilerleme_yok["not"] ? ' — ' + esc(d.ilerleme_yok["not"]) : '') +
      '<div class="vk-kucuk">' + (iyMetraj > 0
        ? 'Metraj yapıldı (' + tl(iyMetraj) + ' m), vardiyada bu da yapıldı.'
        : 'Metraj ilerlemedi, makine çalıştı.') + '</div></div>'
    : "";

  var ar = arizaIc(d), bk = beklemeIc(d), ml = malzemeIc(d),
      ol = olcumIc(d), gd = giderIc(d);

  /* ---- kontrol listesi ---- */
  var kn = "";
  if(d.kontrol && typeof d.kontrol === "object"){
    var anahtar = Object.keys(d.kontrol);
    if(anahtar.length){
      var uygun = anahtar.filter(function(k){ return d.kontrol[k]; }).length;
      kn = uygun + " / " + anahtar.length + " uygun";
      var sorun = anahtar.filter(function(k){ return !d.kontrol[k]; });
      if(sorun.length) kn += '<div class="vk-kucuk">İşaretlenmeyen: ' +
        esc(sorun.join(", ")) + '</div>';
    }
  }

  /* ---- düzeltme izi ---- */
  var dz = izIc(d), izNot = izNotu(d);

  var govde = satirlar([
    bolum("Ekip", ekip),
    bolum("Motor", motor),
    bolum("Manevra", mv),
    iy ? bolum("İlerleme", iy) : "",
    bolum("Mazot", d.mazot == null ? "" : tl(d.mazot, 0) + " lt"),
    bolum("Kuyu durumu", KUYU_DURUM[d.kuyu_durumu] || ""),
    bolum("Arıza", ar),
    bolum("Bekleme", bk),
    bolum("Malzeme", ml),
    bolum("O günün ölçümleri", ol),
    bolum("O günün giderleri", gd),
    bolum("Vardiya öncesi kontrol", kn),
    bolum("Not", d["not"] ? esc(d["not"]) : ""),
    bolum("Düzeltme izi", dz ? dz + izNot : "")
  ]);

  var alt = '<div class="vk-alt">Girildi ' + anTarih(d.girildi) +
    ((d.duzeltmeler || []).length
      ? ' · ' + d.duzeltmeler.length + ' düzeltme' : ' · düzeltilmedi') + '</div>';

  return '<div class="vk-kart">' + ust + govde + alt + '</div>';
}

/* ============================================================
   DÜZELTME EKRANININ YAN KAYITLARI (A2 · 68. dosya)
   ============================================================
   Tayfun: "Düzeltme ekranında arıza · bekleme · malzeme · gider
   görünsün."

   Bunların hiçbiri düzeltme ekranından DEĞİŞTİRİLEMİYOR ve bu veri
   yapısından geliyor, tercih değil:
     · arıza ve bekleme ayrı tablolarda, kendi kayıtları var
     · gider `expenses`te ve vardiyaya değil PROJE + TARİHe bağlı
     · ölçüm `well_surveys`te ve KUYU + TARİHe bağlı
     · malzeme vardiyaya bağlı ama düzeltme ekranı onu okumuyor;
       okumadığı için yazarsa üstüne EKLER, değiştirmez

   O yüzden kart burada açıkça "görüntüdür" diyor. Şef düzeltmeye
   girince bu verilerin hâlâ orada olduğunu görüyor; silindi sanıp
   yeniden girmiyor.
   ============================================================ */
function yan(d){
  if(!d) return "";
  var ar = arizaIc(d), bk = beklemeIc(d), ml = malzemeIc(d),
      ol = olcumIc(d), gd = giderIc(d), dz = izIc(d);
  var govde = satirlar([
    bolum("Arıza", ar),
    bolum("Bekleme", bk),
    bolum("Malzeme", ml),
    bolum("O günün ölçümleri", ol),
    bolum("O günün giderleri", gd),
    bolum("Düzeltme izi", dz ? dz + izNotu(d) : "")
  ]);
  if(!govde) return "";
  stil();
  return '<div class="vk-kart vk-yan">' +
    '<div class="vk-ust"><div><b>Bu vardiyaya girilmiş diğer kayıtlar</b></div></div>' +
    '<div class="vk-kucuk">Bunlar burada DEĞİŞTİRİLEMİYOR — görünmeleri, ' +
    'silindi sanıp yeniden girilmesin diye. Değiştirmek için ilgili ' +
    'bölümden yeni kayıt girilmesi gerekiyor.</div>' +
    govde + '</div>';
}

/* Sayfanın kendi <style>'ına dokunmadan, kart ilk çizildiğinde bir
   kere ekleniyor. İki ekran da aynı görünümü alıyor. */
var STIL_EKLI = false;
function stil(){
  if(STIL_EKLI) return; STIL_EKLI = true;
  var s = document.createElement("style");
  s.textContent =
    ".vk-kart{font-size:14px;line-height:1.45}" +
    ".vk-ust{display:flex;justify-content:space-between;align-items:baseline;" +
      "gap:10px;flex-wrap:wrap;padding-bottom:9px;margin-bottom:4px;" +
      "border-bottom:2px solid currentColor}" +
    ".vk-metraj{font-weight:700;white-space:nowrap}" +
    ".vk-bol{padding:9px 0;border-bottom:1px solid rgba(128,128,128,.22)}" +
    ".vk-bol:last-of-type{border-bottom:0}" +
    ".vk-bas{font-size:11px;letter-spacing:.12em;text-transform:uppercase;" +
      "opacity:.6;margin-bottom:4px}" +
    ".vk-sat{display:flex;justify-content:space-between;gap:10px;padding:1px 0}" +
    ".vk-sat>span:last-child{text-align:right;white-space:nowrap}" +
    ".vk-kucuk{font-size:12px;opacity:.65;margin:1px 0 3px}" +
    ".vk-uy{padding:7px 9px;border-radius:8px;" +
      "background:rgba(200,140,0,.12);border-inline-start:3px solid rgba(200,140,0,.8)}" +
    ".vk-tbl{width:100%;border-collapse:collapse;font-size:13px}" +
    ".vk-tbl th{text-align:left;font-weight:600;opacity:.6;font-size:11px;" +
      "text-transform:uppercase;letter-spacing:.06em;padding:2px 6px 4px 0}" +
    ".vk-tbl td{padding:2px 6px 2px 0}" +
    ".vk-tbl td.s,.vk-tbl th:nth-child(n+2){text-align:right}" +
    ".vk-tbl td.s{font-variant-numeric:tabular-nums}" +
    ".vk-alt{margin-top:9px;font-size:12px;opacity:.6}" +
    ".vk-bos{opacity:.6;padding:10px 0}" +
    ".vk-yan{padding:10px 12px;border-radius:10px;" +
      "border:1px solid rgba(128,128,128,.3)}" +
    ".vk-yan .vk-ust{border-bottom-width:1px;padding-bottom:5px}";
  document.head.appendChild(s);
}

/* Kartı bir kaba çizer. sb: supabase istemcisi, hedef: DOM elemanı. */
function ac(sb, shiftId, hedef, bitti){
  stil();
  hedef.innerHTML = '<div class="vk-bos">Yükleniyor…</div>';
  return Promise.resolve(sb.rpc("vardiya_karti", {p_shift: shiftId}))
    .then(function(r){
      if(r.error){
        hedef.innerHTML = '<div class="vk-bos">Kart okunamadı: ' +
          esc(r.error.message) + '</div>';
        return null;
      }
      hedef.innerHTML = ciz(r.data);
      if(typeof bitti === "function") bitti(r.data);
      return r.data;
    })
    .catch(function(e){
      hedef.innerHTML = '<div class="vk-bos">Kart okunamadı: ' +
        esc(e && e.message || e) + '</div>';
      return null;
    });
}

return { ciz: ciz, yan: yan, ac: ac, stil: stil };
})();
