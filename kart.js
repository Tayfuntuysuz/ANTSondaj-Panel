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
/* 70. adım · Operasyon listesi şefin girdiği SIRAYLA (119. dosya).
   Önce bütün operasyonlar "Bekleme" başlığı altında, türe göre ve
   saatsiz çıkıyordu; delgi "0,0 saat" görünüyordu. */
var OP_AD = {delgi:"Delgi", muhafaza:"Muhafaza borusu", bekleme:"Bekleme",
  ariza:"Arıza", nakliye:"Nakliye", takim:"Takım çekme / indirme",
  temizlik:"Kuyu temizleme", kuyu_bitimi:"Kuyu bitimi",
  manevra:"Manevra", kuyu_hazirlik:"Kuyu hazırlık", bakim:"Bakım", diger:"Diğer"};
var OP_SEBEP = {operasyonel:"operasyonel", operasyonel_degil:"operasyonel değil",
  kuyu_sonu:"kuyu sonu", kuyu_iptali:"kuyu iptali"};
/* Sürüm 73 · 143. dosya · Tayfun: "Her operasyonun karşısında zaman
   aralığı yazıyor, delgi hariç. Delginin de yazması gerekiyor."
   Delginin kendi saati yok; manevralardan çıkar. Bir delgi satırına,
   kendinden önceki saatli operasyonun bitişi ile sonraki saatli
   operasyonun başlangıcı arasına düşen manevralar yazılır; aralık
   ilkinin başı – sonuncunun sonu. Gece vardiyası gece yarısını
   geçtiği için saatler vardiyanın ilk saatine göre sıralanır.
   Manevralar saatsizse (sürüm 62 öncesi) satır eskisi gibi kalır. */
function delgiAraliklari(d){
  var ops = d.operasyonlar || [], mv = (d.manevralar || []).filter(function(r){ return r.bas && r.bit; });
  if(!mv.length) return {};
  var dk = function(s){ var m = /^(\d{1,2}):(\d{2})/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  var hepsi = [];
  ops.forEach(function(o){ if(o.bas) hepsi.push(dk(o.bas)); });
  mv.forEach(function(r){ hepsi.push(dk(r.bas)); });
  hepsi = hepsi.filter(function(x){ return x != null; });
  if(!hepsi.length) return {};
  /* Vardiyanın başı: gündüzse en küçük saat; gece ise 12:00'den sonraki
     en küçük saat (20:00 … 08:00). Ondan küçük saatler ertesi güne sayılır. */
  var ogleSonra = hepsi.filter(function(x){ return x >= 720; }), sabah = hepsi.filter(function(x){ return x < 720; });
  var vd = String(d.vardiya || "").toLocaleLowerCase("tr");
  var gece = ogleSonra.length && sabah.length &&
    (vd ? (vd.indexOf("gece") >= 0 || vd === "2") : Math.min.apply(null, ogleSonra) >= 960);
  var taban = gece ? Math.min.apply(null, ogleSonra) : Math.min.apply(null, hepsi);
  var g = function(s){ var x = dk(s); return x == null ? null : (x < taban ? x + 1440 : x); };
  var sonuc = {};
  ops.forEach(function(o, i){
    if(o.tur !== "delgi" || (o.bas && o.bit)) return;
    var alt = null, ust = null, j;
    for(j = i - 1; j >= 0; j--) if(ops[j].tur !== "delgi" && ops[j].bit){ alt = g(ops[j].bit); break; }
    for(j = i + 1; j < ops.length; j++) if(ops[j].tur !== "delgi" && ops[j].bas){ ust = g(ops[j].bas); break; }
    var ic = mv.filter(function(r){ var b = g(r.bas), s = g(r.bit);
      return (alt == null || b >= alt) && (ust == null || s <= ust); });
    if(!ic.length) return;
    var bas = ic[0], son = ic[0];
    ic.forEach(function(r){ if(g(r.bas) < g(bas.bas)) bas = r; if(g(r.bit) > g(son.bit)) son = r; });
    sonuc[i] = {bas: bas.bas, bit: son.bit, saat: (g(son.bit) - g(bas.bas)) / 60};
  });
  return sonuc;
}
function operasyonIc(d){
  var DA = delgiAraliklari(d);
  return (d.operasyonlar || []).map(function(o, oi){
    if(DA[oi]) o = Object.assign({}, o, DA[oi]);
    var ek = [];
    if(o.sebep) ek.push(OP_SEBEP[o.sebep] || BEKLEME_AD[o.sebep] || o.sebep);
    if(o.from_m != null || o.to_m != null)
      ek.push(tl(o.from_m) + '–' + tl(o.to_m) + ' m' + (o.cap ? ' · ' + o.cap : ''));
    else if(o.cap) ek.push(o.cap);
    if(o.tur === "delgi") ek.push("manevralar yukarıda");
    if(o.otomatik) ek.push("program hesapladı");
    var sag = o.bas && o.bit ? esc(o.bas) + '–' + esc(o.bit) + ' · ' + tl(o.saat, 1) + ' sa'
            : (o.saat ? tl(o.saat, 1) + ' saat' : '');
    return '<div class="vk-sat"><span>' + esc(OP_AD[o.tur] || o.tur || "") +
           (ek.length ? ' <span class="vk-kucuk">' + esc(ek.join(" · ")) + '</span>' : '') +
           '</span><span>' + sag + '</span></div>' +
           (o["not"] && !o.otomatik ? '<div class="vk-kucuk">' + esc(o["not"]) + '</div>' : ''); }).join("");
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
  /* 70. adım: manevra saati de geliyor (şef 62. sürümden beri giriyor);
     hiçbir manevrada saat yoksa sütun çıkmıyor (eski kayıtlar). */
  var mvSaat = (d.manevralar || []).some(function(r){ return r.bas || r.bit; });
  var mv = (d.manevralar || []).length
    ? '<table class="vk-tbl"><thead><tr>' + (mvSaat ? '<th>Saat</th>' : '') +
      '<th>Çap</th><th class="s">Başlangıç</th>' +
      '<th class="s">Bitiş</th><th class="s">Metre</th></tr></thead><tbody>' +
      d.manevralar.map(function(r){
        return '<tr>' + (mvSaat ? '<td>' + esc(r.bas || '') + (r.bit ? '–' + esc(r.bit) : '') + '</td>' : '') +
               '<td>' + esc(r.cap) + '</td><td class="s">' + tl(r.from_m) +
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

  /* ---- saat özeti (sürüm 68): delgi · duruş · diğer ----
     Delgi saati manevra aralıklarından; manevralar saatsizse ve metraj
     varsa kalan süre delgiye sayılır. Vardiya 12 saat kabul edilir;
     kayıtlı saatler onu aşıyorsa çubuk toplamı esas alır. */
  var dkS = function(x){ var p = String(x || "").split(":"); return p.length < 2 ? null : Number(p[0]) * 60 + Number(p[1]); };
  var sDelgi = null, sDurus = 0, sDiger = 0;
  (d.manevralar || []).forEach(function(r){
    var a = dkS(r.bas), z = dkS(r.bit); if(a == null || z == null) return;
    sDelgi = (sDelgi || 0) + ((z - a + (z < a ? 1440 : 0)) / 60);
  });
  (d.operasyonlar || []).forEach(function(o){
    var s = Number(o.saat || 0); if(!s || o.tur === "delgi") return;
    if(o.tur === "bekleme" || o.tur === "ariza") sDurus += s; else sDiger += s;
  });
  if(sDelgi == null) sDelgi = Number(d.metraj || 0) > 0 ? Math.max(12 - sDurus - sDiger, 0) : 0;
  var sTop = Math.max(12, sDelgi + sDurus + sDiger);
  var ozet = (d.operasyonlar && (sDelgi + sDurus + sDiger) > 0)
    ? '<div class="vk-ozet"><div class="vk-sb"><i style="width:' + (sDelgi / sTop * 100) + '%"></i><b style="width:' +
        (sDurus / sTop * 100) + '%"></b><u style="width:' + (sDiger / sTop * 100) + '%"></u></div>' +
      '<span class="d">Delgi ' + tl(sDelgi, 1) + ' sa</span><span class="r">Duruş ' + tl(sDurus, 1) +
      ' sa</span><span class="g">Diğer ' + tl(sDiger, 1) + ' sa</span></div>'
    : "";

  /* ---- iki sütun (sürüm 68) ----
     Geniş yerde solda işin kendisi (manevra, operasyonlar, ilerleme,
     arıza), sağda geri kalanı. Dar yerde (telefon, yan kart) tek sütun
     ve ESKİ sıra: her bölüm sıra numarasını taşıyor. */
  var SOL = {"Manevra":1, "Operasyonlar":1, "İlerleme":1, "Arıza":1, "Bekleme":1};
  var sol = [], sag = [], sira = 0;
  var koy = function(baslik, ic){
    if(!ic) return;
    sira++;
    var h = bolum(baslik, ic).replace('<div class="vk-bol">', '<div class="vk-bol" style="order:' + sira + '">');
    (SOL[baslik] ? sol : sag).push(h);
  };
  koy("Ekip", ekip);
  koy("Motor", motor);
  koy("Manevra", mv);
  /* Merkezde 70. adım yoksa eski "Bekleme" bölümü */
  if(d.operasyonlar) koy("Operasyonlar", operasyonIc(d));
  if(iy) koy("İlerleme", iy);
  koy("Mazot", d.mazot == null ? "" : tl(d.mazot, 0) + " lt");
  koy("Kuyu durumu", KUYU_DURUM[d.kuyu_durumu] || "");
  koy("Arıza", ar);
  if(!d.operasyonlar) koy("Bekleme", bk);
  koy("Malzeme", ml);
  koy("O günün ölçümleri", ol);
  koy("O günün giderleri", gd);
  koy("Vardiya öncesi kontrol", kn);
  koy("Not", d["not"] ? esc(d["not"]) : "");
  koy("Düzeltme izi", dz ? dz + izNot : "");
  var govde = ozet + '<div class="vk-iki"><div class="vk-sol">' + sol.join("") +
              '</div><div class="vk-sag">' + sag.join("") + '</div></div>';

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
  /* Operasyon listesi düzeltme ekranında zaten düzenleniyor; burada
     yalnız program hesabı (arıza saati) kalıyor. Merkezde 70. adım
     yoksa eski "Bekleme" bölümü. */
  if(d.operasyonlar){
    bk = operasyonIc({operasyonlar: d.operasyonlar.filter(function(o){ return o.otomatik; })});
  }
  var govde = satirlar([
    bolum("Arıza", ar),
    bolum(d.operasyonlar ? "Program hesabı" : "Bekleme", bk),
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
    ".vk-tbl td{padding:2px 6px 2px 0;text-align:left}" +
    ".vk-tbl td.s,.vk-tbl th.s{text-align:right}" +
    ".vk-tbl td.s{font-variant-numeric:tabular-nums}" +
    ".vk-alt{margin-top:9px;font-size:12px;opacity:.6}" +
    ".vk-bos{opacity:.6;padding:10px 0}" +
    ".vk-yan{padding:10px 12px;border-radius:10px;" +
      "border:1px solid rgba(128,128,128,.3)}" +
    ".vk-yan .vk-ust{border-bottom-width:1px;padding-bottom:5px}" +
    /* Sürüm 68 · iki sütun: kart 720 pikselden genişse. Dar yerde
       sütunlar çözülür, bölümler eski sırasıyla alt alta dizilir. */
    ".vk-kart{container-type:inline-size}" +
    ".vk-iki{display:flex;flex-direction:column}" +
    ".vk-sol,.vk-sag{display:contents}" +
    ".vk-iki .vk-bol:last-of-type{border-bottom:1px solid rgba(128,128,128,.22)}" +
    "@container (min-width:720px){" +
      ".vk-iki{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:0 34px;align-items:start}" +
      ".vk-sol,.vk-sag{display:block;min-width:0}" +
      ".vk-iki .vk-bol:last-of-type{border-bottom:0}}" +
    ".vk-ozet{padding:10px 0 11px;border-bottom:1px solid rgba(128,128,128,.22);font-size:13px}" +
    ".vk-sb{display:flex;height:10px;border-radius:5px;overflow:hidden;background:rgba(128,128,128,.2);margin-bottom:7px}" +
    ".vk-sb i{background:var(--cubuk,#5f7f9b)}.vk-sb b{background:var(--bad,#b3261e)}.vk-sb u{background:var(--cubuk-soluk,#a9bccb)}" +
    ".vk-ozet span{margin-right:16px;white-space:nowrap;opacity:.85}" +
    ".vk-ozet span::before{content:'';display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}" +
    ".vk-ozet .d::before{background:var(--cubuk,#5f7f9b)}.vk-ozet .r::before{background:var(--bad,#b3261e)}" +
    ".vk-ozet .g::before{background:var(--cubuk-soluk,#a9bccb)}";
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
