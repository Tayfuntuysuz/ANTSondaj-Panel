/* ============================================================
   Sondaj Panel — ortak kabuk
   Her sayfa bunu yükler ve SP.boot({sayfa, baslik}) ile açılır.
   Kabuk şunları üstlenir:
     • dosyadan açılma uyarısı ve genel hata yakalama
     • bağlantı ayarları, kurulum ekranı, giriş ekranı
     • my_access() ile rol ve modüle göre menü kurulumu
     • yetkisiz sayfaya erişimin engellenmesi
     • ortak yardımcılar ve sondaj görselleri
   ============================================================ */
window.SP = (function(){
"use strict";

/* Ofis panellerinin sürümü, saha paneliyle AYNI diziden. Eskiden burada
   "2.0" yazıyordu, saha paneli 39'daydı; hangi dosyanın sunucuda olduğu
   anlaşılmıyordu (22 Ekim). Paket çıkarken ikisi birlikte artıyor. */
var SURUM = "40";

/* ---------- yardımcılar ---------- */
var $  = function(s, k){ return (k||document).querySelector(s); };
var $$ = function(s, k){ return Array.prototype.slice.call((k||document).querySelectorAll(s)); };
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); }
/* ---------- biçim: sayı, para, tarih ----------
   Dil ve para birimi tek yerden gelir. Dil kullanıcının seçimi (cihazda),
   para birimi firmanın ayarı. Koda "tr-TR" ya da "₺" yazılmaz. */
var BICIM = { dil:"tr-TR", para:"TRY" };
function bicimKur(){
  var d = oku("sp_dil"); if(d) BICIM.dil = d;
  if(erisim && erisim.para_birimi) BICIM.para = erisim.para_birimi;
}
function tl(n,d){ d=(d===undefined?2:d);
  return Number(n||0).toLocaleString(BICIM.dil,{minimumFractionDigits:d,maximumFractionDigits:d}); }
function money(n){
  try{
    return Number(n||0).toLocaleString(BICIM.dil,
      {style:"currency", currency:BICIM.para, maximumFractionDigits:0});
  }catch(e){ return tl(n,0) + " " + BICIM.para; }
}
function iso(d){ d=d||new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function trd(s){ if(!s) return "—"; var p=String(s).slice(0,10).split("-"); return p[2]+"."+p[1]+"."+p[0]; }
function msg(el,t,k){ if(!el) return; el.innerHTML = t ? '<div class="msg '+(k||"")+'">'+t+'</div>' : ""; }
function bashrf(ad){
  var p=String(ad||"").replace(/[—-].*/,"").trim().split(/\s+/);
  return (((p[0]||"")[0]||"")+((p[1]||"")[0]||"")).toLocaleUpperCase("tr");
}
var AYLAR=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
           "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

/* ---------- ikonlar ---------- */
var IC = {
  pano:'<path d="M3 13h8V3H3v10zm10 8h8V11h-8v10zM3 21h8v-6H3v6zM13 3v6h8V3h-8z"/>',
  kule:'<path d="M12 2v20M5 22 12 4l7 18M7.5 16h9M9 11h6"/>',
  matkap:'<path d="M12 2v6M8 8h8l-1.5 5h-5L8 8zM10 13l2 9 2-9"/>',
  kuyu:'<path d="M4 6h16M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6M10 10v8M14 10v8"/>',
  rapor:'<path d="M4 3h11l5 5v13H4V3zm11 0v5h5M8 13h8M8 17h5"/>',
  para:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  kisi:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>',
  ofis:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2M13 9h2M9 13h2M13 13h2M9 17h6"/>',
  ayar:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1 2 2 0 1 1-2.8-2.8 1.6 1.6 0 0 0-1.1-2.7 2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7 2 2 0 1 1 2.8-2.8 1.6 1.6 0 0 0 2.7-1.1 2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1 2 2 0 1 1 2.8 2.8 1.6 1.6 0 0 0 1.1 2.7 2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.4.9z"/>',
  kalkan:'<path d="M9 12l2 2 4-4M12 3l8 4v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V7l8-4z"/>',
  saat:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  /* 22 Ekim: menüde dört ikon ikiz çıkmıştı (ayar 2, para 2, kişi 2,
     rapor 3). Tekrarlayan ikon ikonu işlevsiz yapıyor — göz ikona
     değil yazıya bakmak zorunda kalıyor. Her satıra kendi ikonu. */
  takvim:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/>',
  cuzdan:'<path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5a2 2 0 0 1-2-2z"/><circle cx="17" cy="14" r="1.2"/>',
  grafik:'<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/>',
  kilit:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
};
function ikon(k){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '+
         'stroke-linecap="round" stroke-linejoin="round">'+(IC[k]||IC.pano)+'</svg>';
}

/* ---------- menü tanımı: sayfa anahtarı -> dosya, ad, ikon, grup ---------- */
/* 22 Ekim · Tayfun: "Sol taraftaki menüyü kategorilendirip azaltalım."
   Eski hâli 6 grup / 11 satırdı; üç grupta tek satır vardı, "Merkez ofis"
   ve "Maaş tablosu" analiz grubunda duruyordu (ikisi de para), iki satır
   da olmayan sayfalara gidiyordu. Yeni hâli 32. dosyadaki karar:
   4 grup, rolüne göre 8 satıra kadar.

   Alanlar:
     k      yetki anahtarı (page_access)
     d      hedef · dv  rol listede değilse kullanılacak hedef
     g      grup · i  ikon (hiçbir ikon iki satırda tekrarlanmıyor)
     cift   eş sayfa kümesi — menüde TEK satır, sayfanın üstünde şerit
     bas    kümenin menüde görünen adını taşıyan satır
     sekme  şeritteki kısa ad
     yok    ekranı henüz yazılmadı — menüde hiç gösterilmez */
var SAYFALAR = [
  {k:"panel",    d:"panel.html",     ad:"Genel bakış",        i:"pano",   g:"Günlük"},
  {k:"saha",     d:"index.html",     ad:"Vardiya girişi",     i:"kule",   g:"Günlük"},
  /* Puantaj tek sayfa anahtari ama iki ayri hedef (39. dosya karari):
     saha sefi kendi PWA'sinda girer, digerleri panel.html'deki salt okunur
     ozete gider. Yoneticinin kendi puantaj sayfasi (puantaj.html, 32. dosya)
     yapilinca "dv" oraya cevrilecek. */
  {k:"kuyular",  d:"panel.html#kuyular", ad:"Kuyular",        i:"kuyu",   g:"Günlük"},
  /* Puantaj tek sayfa anahtari ama iki ayri hedef (39. dosya karari):
     saha sefi kendi PWA'sinda girer, digerleri panel.html'deki salt okunur
     ozete gider. Yoneticinin kendi puantaj sayfasi (puantaj.html, 32. dosya)
     yapilinca "dv" oraya cevrilecek. */
  {k:"puantaj",  d:"index.html#puantaj", dv:"panel.html#puantaj",
                 roller:{site_chief:1}, ad:"Puantaj",          i:"takvim", g:"Günlük"},
  {k:"sefozet",  d:"panel.html",     ad:"Saha özetim",        i:"pano",   g:"Günlük"},

  {k:"rapor",    d:"rapor.html",     ad:"Aylık rapor",        i:"rapor",  g:"Ay sonu"},
  /* Ay kilidi (aykilidi.html) ve Hakediş (hakedis.html) buraya gelecek.
     Hakediş bugüne kadar muhasebe.html#fatura'ya gidiyordu — orada
     öyle bir ekran yok, satır boşluğa tıklatıyordu. Ekranı olmayan
     satır gösterilmiyor: şefin sessizce çalışmayan "kaydet" düğmesiyle
     aynı hata (32. dosya kuralı). */
  {k:"hakedis",  d:"hakedis.html",   ad:"Hakediş",            i:"kilit",  g:"Ay sonu", yok:1},

  /* PARA — "Merkez ofis" ve "Maaş tablosu" analiz grubundaydı, ikisi de
     para. Muhasebe ile Merkez ofis tek satırda, sayfa üstünde şeritle. */
  {k:"muhasebe", d:"muhasebe.html",  ad:"Muhasebe",           i:"para",   g:"Para",
                 cift:"muhasebe", bas:1, sekme:"Muhasebe"},
  {k:"ofis",     d:"ofis.html",      ad:"Merkez ofis",        i:"ofis",   g:"Para",
                 cift:"muhasebe", sekme:"Merkez ofis"},
  {k:"maaslar",  d:"maaslar.html",   ad:"Maaş tablosu",       i:"cuzdan", g:"Para"},

  /* ANALİZ + YÖNETİM — şantiye karşılaştırma ile şirket performansı
     tek satırda. santiyeler.html bugüne kadar HİÇBİR role verilmemişti;
     sayfa çalışıyordu ama kimse açamıyordu (32. dosya, 1. sorun). */
  {k:"santiyeler", d:"santiyeler.html", ad:"Analiz",          i:"grafik", g:"Analiz ve yönetim",
                 cift:"analiz", bas:1, sekme:"Şantiyeler"},
  {k:"sirket",   d:"sirket.html",    ad:"Şirket performansı", i:"grafik", g:"Analiz ve yönetim",
                 cift:"analiz", sekme:"Şirket performansı"},
  {k:"anaveri",  d:"yonetim.html",   ad:"Ana veri ve projeler", i:"ayar", g:"Analiz ve yönetim"},
  {k:"kullanicilar", d:"kullanicilar.html", ad:"Kullanıcılar", i:"kisi",  g:"Analiz ve yönetim", yok:1},

  {k:"isveren",  d:"isveren.html",   ad:"Raporlarım",         i:"kalkan", g:"Raporlarım"}
];
var GRUP_SIRA = ["Günlük","Ay sonu","Para","Analiz ve yönetim","Raporlarım"];

/* ---------- durum ---------- */
var sb = null, erisim = null, cfg = {url:"", key:""}, AYAR = {};
/* Oturumdaki kullanıcı. my_access e-posta döndürmüyor; şifre sıfırlama
   bağlantısı için adres buradan okunuyor. */
var OTURUM = {};

function oku(k){ try{ return localStorage.getItem(k) || ""; }catch(e){ return ""; } }
function yaz(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function sil(k){ try{ localStorage.removeItem(k); }catch(e){} }

/* ---------- tema ve yazı boyutu ----------
   Üç durum: "" (cihazı takip et) · "acik" · "koyu".
   Sayfa boyanmadan önce <head> içindeki küçük betik uygular; buradaki
   işlevler yalnız kullanıcı değiştirince çalışır. */
function temaOku(){ return oku("sp_tema"); }
function temaYaz(v){
  if(v){ yaz("sp_tema", v); document.documentElement.setAttribute("data-tema", v); }
  else { sil("sp_tema"); document.documentElement.removeAttribute("data-tema"); }
}
function yaziOku(){ return oku("sp_yazi"); }
function yaziYaz(v){
  if(v){ yaz("sp_yazi", v); document.documentElement.setAttribute("data-yazi", v); }
  else { sil("sp_yazi"); document.documentElement.removeAttribute("data-yazi"); }
}

/* ---------- ekranlar ---------- */
function kabukKur(){
  var s = document.createElement("div");
  s.className = "sp-shell"; s.id = "sp-shell"; s.hidden = true;
  s.innerHTML =
    '<aside class="sp-side">' +
      '<div class="sp-brand"><span class="mk"><img src="logo-mark.png" alt="" ' +
        'onerror="this.onerror=null;this.src=\'icon.svg\'"></span>' +
        '<span class="txt"><span class="t" id="sp-firma">Sondaj Panel</span>' +
        '<span class="s" id="sp-rol">—</span></span></div>' +
      '<div id="sp-menu"></div>' +
      '<div class="foot">Sürüm ' + SURUM + '</div>' +
    '</aside>' +
    '<div class="sp-main">' +
      '<div class="sp-top">' +
        '<div><div class="yol" id="sp-yol"></div><h1 id="sp-baslik"></h1></div>' +
        '<div class="sp"><span id="sp-arac"></span>' +
          '<button class="sp-kisi" id="sp-kisi" type="button" ' +
            'aria-label="Ayarlar"><span class="av" id="sp-av"></span>' +
          '<span><span class="ad" id="sp-ad"></span><br>' +
          '<span class="rol" id="sp-rol2"></span></span></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(s);
  var ic = $("#sp-icerik");
  if(ic){ $(".sp-main", s).appendChild(ic); }
  else { var d=document.createElement("div"); d.id="sp-icerik"; d.className="sp-icerik";
         $(".sp-main", s).appendChild(d); }
  $("#sp-icerik").classList.add("sp-icerik");
  $("#sp-kisi").addEventListener("click", ayarlarAc);
  return s;
}

/* ---------- ayarlar ----------
   Her panelde aynı ekran. Alt menüye yeni bir sayfa eklenmiyor;
   üstteki kullanıcı adına basınca açılıyor.
   Burası KİŞİSEL ayar: tema, yazı boyutu, dil, şifre.
   Para birimi, hafta sonu, bakım aralığı gibi FİRMA ayarları
   yönetici ekranında kalır. */
function ayarSegment(ad, secenekler, simdi, uygula){
  return '<div class="ayar-not">'+esc(ad)+'</div><div class="segment" data-seg="'+esc(uygula)+'">' +
    secenekler.map(function(o){
      return '<button type="button" data-v="'+esc(o[0])+'" aria-pressed="' +
        (o[0] === simdi ? "true" : "false") + '">'+esc(o[1])+'</button>';
    }).join("") + '</div>';
}

function ayarlarAc(){
  if($("#sp-ayar")) return;
  var e = erisim || {};
  var posta = e.eposta || OTURUM.email || "";
  var d = document.createElement("div");
  d.className = "ayar-ort"; d.id = "sp-ayar";
  d.innerHTML =
    '<div class="ayar-kut" role="dialog" aria-modal="true" aria-label="Ayarlar">' +
      '<div class="ayar-bas"><h2>AYARLAR</h2>' +
        '<button class="kapa" type="button" id="ay-kapa" aria-label="Kapat">×</button></div>' +
      '<div class="ayar-govde">' +

        '<section class="ayar-blok"><h3>Görünüm</h3>' +
          ayarSegment("Tema", [["","Sistem"],["acik","Açık"],["koyu","Koyu"]], temaOku(), "tema") +
          '<div style="height:14px"></div>' +
          ayarSegment("Yazı boyutu", [["","Normal"],["buyuk","Büyük"]], yaziOku(), "yazi") +
        '</section>' +

        '<section class="ayar-blok"><h3>Hesap</h3>' +
          '<div class="ayar-sat"><span class="k">Kullanıcı</span>' +
            '<span class="v">'+esc(e.kullanici||"—")+'</span></div>' +
          (posta ? '<div class="ayar-sat"><span class="k">E-posta</span>' +
            '<span class="v">'+esc(posta)+'</span></div>' : "") +
          '<div class="ayar-sat"><span class="k">Rol</span>' +
            '<span class="v"><span class="pill">'+esc(e.rol_adi||"—")+'</span></span></div>' +
          (e.firma ? '<div class="ayar-sat"><span class="k">Firma</span>' +
            '<span class="v">'+esc(e.firma)+'</span></div>' : "") +
          '<div style="margin-top:11px"><button class="btn gh sm" type="button" id="ay-sifre">' +
            'Şifre değiştir</button></div>' +
          '<div id="ay-sifre-msg"></div>' +
        '</section>' +

        '<section class="ayar-blok"><h3>Dil ve bölge</h3>' +
          '<label class="ayar-not" for="ay-dil">Dil</label>' +
          '<select id="ay-dil"><option value="tr-TR">Türkçe</option></select>' +
        '</section>' +

        '<section class="ayar-blok">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<div><div style="font-size:13.5px">Sürüm 2.0</div>' +
            '<div class="hint">Sondaj Panel</div></div>' +
            '<button class="btn gh sm teh" type="button" id="ay-cikis" ' +
              'style="margin-inline-start:auto">Çıkış</button></div>' +
        '</section>' +

      '</div></div>';
  document.body.appendChild(d);

  var kapat = function(){ d.remove(); };
  $("#ay-kapa", d).addEventListener("click", kapat);
  d.addEventListener("click", function(ev){ if(ev.target === d) kapat(); });
  document.addEventListener("keydown", function esc1(ev){
    if(ev.key === "Escape"){ kapat(); document.removeEventListener("keydown", esc1); }
  });

  $$(".segment", d).forEach(function(seg){
    seg.addEventListener("click", function(ev){
      var b = ev.target.closest("button[data-v]"); if(!b) return;
      var v = b.getAttribute("data-v");
      if(seg.getAttribute("data-seg") === "tema") temaYaz(v); else yaziYaz(v);
      $$("button", seg).forEach(function(x){
        x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    });
  });

  var dsel = $("#ay-dil", d);
  if(dsel){ dsel.value = BICIM.dil;
    dsel.addEventListener("change", function(){ yaz("sp_dil", dsel.value); location.reload(); }); }

  $("#ay-sifre", d).addEventListener("click", function(){
    var m = $("#ay-sifre-msg", d);
    if(!sb || !posta){ msg(m, "Şifre değişikliği için e-posta adresi bulunamadı.", "err"); return; }
    msg(m, "Gönderiliyor…");
    sb.auth.resetPasswordForEmail(posta).then(function(r){
      if(r.error) msg(m, esc(r.error.message), "err");
      else msg(m, "Şifre bağlantısı e-postanıza gönderildi.", "ok");
    }).catch(function(x){ msg(m, esc(String(x && x.message || x)), "err"); });
  });

  $("#ay-cikis", d).addEventListener("click", function(){
    if(!sb){ location.reload(); return; }
    sb.auth.signOut().then(function(){ location.reload(); });
  });
}

function tamEkran(html){
  var d = document.createElement("div");
  d.className = "sp-tam"; d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}
function temizle(){ $$(".sp-tam").forEach(function(e){ e.remove(); }); }

function kurulumEkrani(hata){
  temizle();
  var d = tamEkran(
    '<div class="sp-orta"><div class="logo"><img src="logo.png" alt="" ' +
      'onerror="this.onerror=null;this.src=\'icon.svg\'"></div>' +
    '<h2>Bağlantı kurulumu</h2>' +
    '<div class="hint">Bu adım bir kez yapılır; bilgiler bu tarayıcıya kaydedilir.</div>' +
    '<input id="cfg-url" type="url" placeholder="Proje adresi — https://xxxx.supabase.co" autocomplete="off">' +
    '<input id="cfg-key" type="text" placeholder="Erişim anahtarı (anon public)" autocomplete="off">' +
    '<button class="btn" id="cfg-kaydet" type="button">Kaydet ve devam et</button>' +
    '<button class="btn gh" id="cfg-temizle" type="button">Kayıtlı bilgileri temizle</button>' +
    '<div id="cfg-msg"></div></div>');
  $("#cfg-url").value = cfg.url || "";
  $("#cfg-key").value = cfg.key || "";
  if(hata) msg($("#cfg-msg"), esc(hata), "err");
  $("#cfg-kaydet").addEventListener("click", function(){
    var u = $("#cfg-url").value.trim().replace(/\/+$/,""), k = $("#cfg-key").value.trim();
    if(!/^https:\/\/.+/.test(u)){ msg($("#cfg-msg"), "Proje adresi https:// ile başlamalı.", "err"); return; }
    if(k.length < 30){ msg($("#cfg-msg"), "Erişim anahtarı eksik görünüyor.", "err"); return; }
    yaz("sp_url", u); yaz("sp_key", k); cfg.url = u; cfg.key = k; baglan();
  });
  $("#cfg-temizle").addEventListener("click", function(){
    try{ localStorage.removeItem("sp_url"); localStorage.removeItem("sp_key"); }catch(e){}
    cfg.url = ""; cfg.key = ""; $("#cfg-url").value=""; $("#cfg-key").value="";
    msg($("#cfg-msg"), "Temizlendi.", "ok");
  });
}

function girisEkrani(hata){
  temizle();
  tamEkran(
    '<div class="sp-orta"><div class="logo"><img src="logo.png" alt="" ' +
      'onerror="this.onerror=null;this.src=\'icon.svg\'"></div>' +
    '<h2>Giriş</h2>' +
    '<input id="gr-mail" type="email" placeholder="E-posta" autocomplete="username">' +
    '<input id="gr-pass" type="password" placeholder="Parola" autocomplete="current-password">' +
    '<button class="btn" id="gr-btn" type="button">Giriş yap</button>' +
    '<div id="gr-msg"></div></div>');
  if(hata) msg($("#gr-msg"), esc(hata), "err");
  var dene = function(){
    var e = $("#gr-mail").value.trim(), p = $("#gr-pass").value;
    if(!e || !p){ msg($("#gr-msg"), "E-posta ve parola gerekli.", "err"); return; }
    msg($("#gr-msg"), "Kontrol ediliyor…");
    sb.auth.signInWithPassword({email:e, password:p}).then(function(r){
      if(r.error){ msg($("#gr-msg"), esc(r.error.message), "err"); return; }
      OTURUM = (r.data && r.data.user) || {email:e};
      yetkiAl();
    }).catch(function(x){ msg($("#gr-msg"), esc(String(x && x.message || x)), "err"); });
  };
  $("#gr-btn").addEventListener("click", dene);
  $("#gr-pass").addEventListener("keydown", function(e){ if(e.key === "Enter") dene(); });
}

/* Kullanicinin GERCEKTEN acabilecegi ilk sayfa. Reddetme ekranindaki
   dugme buraya gider: index.html artik yalniz saha sefinin ekrani
   (39. dosya), herkesi oraya yollamak ikinci bir duvara carptiriyordu. */
function ilkSayfa(){
  var izin = (erisim && erisim.sayfalar) || {};
  var s = SAYFALAR.filter(function(x){ return izin[x.k]; })[0];
  return s ? sayfaHedef(s) : "index.html";
}
/* Reddetme ekrani HANGI HESAPLA girildigini soylemek ZORUNDA.
   21 Ekim: Tayfun yonetici panelini acmaya calisti, ekran "Santiye sefi
   rolu bu sayfayi goruntuleyemiyor, yoneticinizle gorusun" dedi. Kendisi
   zaten yonetici; tarayicida sef hesabiyla oturum acikti. Ekran ne hangi
   hesapla girildigini soyluyor ne de cikis yolu veriyordu — sirketin
   sahibine "yoneticinizle gorusun" demek bir sey anlatmiyor. */
function oturumSatiri(){
  if(!erisim || (!erisim.kullanici && !erisim.rol_adi)) return "";
  var kim = esc(erisim.kullanici || "");
  var rol = esc(erisim.rol_adi || "");
  return '<div class="sp-hesap">Açık oturum: <b>' + (kim || "—") + '</b>' +
         (rol ? ' · ' + rol : '') +
         (erisim.firma ? ' · ' + esc(erisim.firma) : '') + '</div>';
}
function uyariEkrani(baslik, metin, cikisla){
  temizle();
  var hedef = ilkSayfa();
  tamEkran('<div class="sp-orta"><h2>'+esc(baslik)+'</h2>' +
    '<div class="msg err">'+metin+'</div>' +
    oturumSatiri() +
    '<button class="btn gh" onclick="location.href=\''+hedef+'\'">Başlangıç sayfası</button>' +
    (cikisla === false ? '' :
      '<button class="btn gh" id="sp-cikis-uyari" type="button" style="margin-top:8px">' +
      'Çıkış yap ve başka hesapla gir</button>') +
    '</div>');
  var c = document.getElementById("sp-cikis-uyari");
  if(c) c.addEventListener("click", function(){
    c.disabled = true; c.textContent = "Çıkılıyor…";
    if(!sb){ location.reload(); return; }
    Promise.resolve(sb.auth.signOut()).then(function(){ location.reload(); })
      .catch(function(){ location.reload(); });
  });
}

/* ---------- menü ---------- */
/* Menu satirinin hedefi. Satirda "roller" varsa ve oturumun rolu o listede
   DEGILSE, "dv" (varsayilan hedef) kullanilir. Yoksa her zaman "d". */
function sayfaHedef(s){
  if(s.dv && s.roller && !s.roller[erisim.rol]) return s.dv;
  return s.d;
}

/* Kullanicinin acabildigi sayfalar, menude gosterilecek hale getirilmis:
   ekrani olmayanlar atiliyor, es sayfalar tek satira katlaniyor. */
function menuSatirlari(){
  var izin = erisim.sayfalar || {};
  var ciftler = {}, satirlar = [];
  SAYFALAR.forEach(function(s){
    if(s.yok) return;                 /* ekrani henuz yok */
    var y = izin[s.k]; if(!y) return; /* yetkisi yok */
    if(!s.cift){ satirlar.push({ad:s.ad, i:s.i, g:s.g, uyeler:[{s:s, y:y}]}); return; }
    /* Es kume: menude TEK satir. Satirin adini "bas" tasiyor ama hedefi
       kullanicinin acabildigi ILK uye belirliyor — patron santiyeler'i
       goremeyip sirket'i gorebiliyor, satir yine calismali. */
    var c = ciftler[s.cift];
    if(!c){ c = ciftler[s.cift] = {uyeler:[]}; satirlar.push(c); }
    c.uyeler.push({s:s, y:y});
    /* Satirin adi "bas" uyesinden; o kullaniciya kapaliysa ilk acik
       uyenin adindan. Boylece satir her durumda bir ad tasiyor. */
    if(s.bas || !c.ad){ c.ad = s.ad; c.i = s.i; c.g = s.g; }
  });
  return satirlar.map(function(r){
    var ilk = r.uyeler[0];
    return {
      k: ilk.s.k,
      ad: r.ad, i: r.i, g: r.g,
      hedef: sayfaHedef(ilk.s),
      /* Satir, kumedeki herhangi bir sayfa acikken isaretli kalmali;
         yoksa Merkez ofis'teyken menude hicbir sey secili gorunmuyor. */
      anahtarlar: r.uyeler.map(function(u){ return u.s.k; }),
      /* "giris" etiketi: kumede yazma yetkisi olan tek bir uye varsa bile. */
      y: r.uyeler.some(function(u){ return u.y === "gir"; }) ? "gir" : "gor"
    };
  });
}

function menuKur(){
  var gruplar = {};
  menuSatirlari().forEach(function(r){ (gruplar[r.g] = gruplar[r.g] || []).push(r); });
  var acikGruplar = GRUP_SIRA.filter(function(g){ return gruplar[g]; });
  /* Rolun tek grubu varsa baslik hic yazilmiyor (32. dosya kurali):
     sef "GUNLUK" basligini okuyup bir sey ogrenmiyor. */
  var basliklar = acikGruplar.length > 1;
  var html = acikGruplar.map(function(g){
    return '<div class="sp-grp">' +
      (basliklar ? '<div class="lbl">'+esc(g)+'</div>' : '') + '<nav class="sp-nav">' +
      gruplar[g].map(function(r){
        var aktif = r.anahtarlar.indexOf(AYAR.sayfa) >= 0;
        return '<a href="'+r.hedef+'" class="'+(aktif?"on":"")+'">'+ikon(r.i) +
               '<span>'+esc(r.ad)+'</span>' +
               (r.y === "gir" ? '<span class="tag">giriş</span>' : '') + '</a>';
      }).join("") + '</nav></div>';
  }).join("");
  $("#sp-menu").innerHTML = html || '<div class="sp-grp"><div class="lbl">Menü boş</div></div>';
}

/* Es sayfalarin serit menusu — sayfanin ustunde, baslik ile icerik
   arasinda. Menuden bir satir eksilirken sayfalar birbirine baglaniyor;
   tek uye aciksa serit hic cizilmiyor, yoksa tek dugmelik bir sekme
   cubugu kullaniciya hicbir sey soylemez. */
function esSeridiKur(){
  var eski = document.getElementById("sp-serit");
  if(eski) eski.remove();
  var bu = SAYFALAR.filter(function(s){ return s.k === AYAR.sayfa; })[0];
  if(!bu || !bu.cift) return;
  var izin = erisim.sayfalar || {};
  var uyeler = SAYFALAR.filter(function(s){
    return s.cift === bu.cift && !s.yok && izin[s.k]; });
  if(uyeler.length < 2) return;
  var d = document.createElement("div");
  d.className = "sp-serit"; d.id = "sp-serit";
  d.setAttribute("role", "tablist");
  d.innerHTML = uyeler.map(function(s){
    var aktif = (s.k === AYAR.sayfa);
    return '<a href="' + sayfaHedef(s) + '" role="tab" aria-selected="' + aktif + '"' +
           (aktif ? ' class="on"' : '') + '>' + esc(s.sekme || s.ad) + '</a>';
  }).join("");
  var ic = document.getElementById("sp-icerik");
  if(ic && ic.parentNode) ic.parentNode.insertBefore(d, ic);
}

function ustKur(){
  $("#sp-firma").textContent = erisim.firma || "Sondaj Panel";
  $("#sp-rol").textContent   = erisim.rol_adi || "";
  $("#sp-ad").textContent    = erisim.kullanici || "";
  $("#sp-rol2").textContent  = erisim.isveren
      ? (erisim.isveren_ad || "İşveren") : (erisim.rol_adi || "");
  $("#sp-av").textContent    = bashrf(erisim.kullanici);
  $("#sp-baslik").textContent = AYAR.baslik || "";
  var s = SAYFALAR.filter(function(x){ return x.k === AYAR.sayfa; })[0];
  $("#sp-yol").textContent = s ? (s.g + " / " + s.ad) : "";
  if(erisim.logo){
    var im = $(".sp-brand img"); if(im) im.src = erisim.logo;
  }
}

/* ---------- açılış zinciri ---------- */
function yetkiAl(){
  temizle();
  sb.rpc("my_access").then(function(r){
    if(r.error){ girisEkrani("Yetki okunamadı: " + r.error.message); return; }
    erisim = r.data || {};
    if(!erisim.kullanici && !erisim.rol){
      uyariEkrani("Hesap tanımlı değil",
        "Bu kullanıcı için firma profili oluşturulmamış. Yöneticinizden hesabınızı tanımlamasını isteyin.");
      return;
    }
    /* Bir dosya birden fazla yetki anahtarıyla açılabiliyor: panel.html
       yöneticide "panel", şefte "sefozet". Tek anahtara bakılınca şefin
       menüsündeki "Saha özetim" satırı kendi reddetme duvarına
       çarpıyordu — satır menüde duruyor, tıklayınca "erişiminiz yok"
       diyor. 22 Ekim'de düzenek yakaladı.
       Eşleşen anahtar AYAR.sayfa'ya yazılıyor ki menüde doğru satır
       işaretli kalsın. */
    var izin = (erisim.sayfalar || {})[AYAR.sayfa];
    if(!izin && AYAR.esanahtar){
      [].concat(AYAR.esanahtar).some(function(k){
        var y = (erisim.sayfalar || {})[k];
        if(y){ izin = y; AYAR.sayfa = k; return true; }
        return false;
      });
    }
    if(!izin){
      uyariEkrani("Bu sayfaya erişiminiz yok",
        "<b>"+esc(erisim.rol_adi||"")+"</b> rolü bu sayfayı görüntüleyemiyor. " +
        "Yetkiniz olması gerekiyorsa başka bir hesapla girmiş olabilirsiniz — " +
        "aşağıda açık oturumun kimin olduğu yazıyor.");
      return;
    }
    AYAR.yetki = izin;
    bicimKur();
    $("#sp-shell").hidden = false;
    menuKur(); ustKur(); esSeridiKur();
    if(typeof AYAR.hazir === "function") AYAR.hazir(erisim, izin);
  }).catch(function(e){
    kurulumEkrani("Sunucuya ulaşılamadı: " + (e && e.message ? e.message : e) +
                  " — proje adresi ve anahtarı doğru mu?");
  });
}

function baglan(){
  temizle();
  if(!window.supabase){
    kurulumEkrani("Supabase kitaplığı yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.");
    return;
  }
  if(!cfg.url || !cfg.key){ kurulumEkrani(""); return; }
  try{
    sb = window.supabase.createClient(cfg.url, cfg.key,
      {auth:{persistSession:true, autoRefreshToken:true}});
    API.sb = sb;
  }catch(e){
    kurulumEkrani("Bağlantı bilgisi geçersiz: " + (e && e.message ? e.message : e));
    return;
  }
  sb.auth.getSession().then(function(r){
    if(r.error) throw r.error;
    OTURUM = (r.data && r.data.session && r.data.session.user) || {};
    if(r.data && r.data.session) yetkiAl(); else girisEkrani();
  }).catch(function(e){
    kurulumEkrani("Sunucuya ulaşılamadı: " + (e && e.message ? e.message : e));
  });
}

function boot(ayar){
  AYAR = ayar || {};
  window.addEventListener("error", function(ev){
    if($("#sp-fatal")) return;
    var d = document.createElement("div"); d.id = "sp-fatal"; d.className = "sp-icerik";
    d.innerHTML = '<div class="kart"><div class="govde"><div class="msg err"><b>Sayfa hatası</b><br>' +
      esc(String(ev.message || "bilinmeyen hata")) + '</div></div></div>';
    (document.body || document.documentElement).appendChild(d);
  });

  if(location.protocol === "file:"){
    tamEkran('<div class="sp-orta"><h2>Dosyadan açıldı</h2><div class="msg err">' +
      '<b>Bu sayfa bilgisayardaki bir dosyadan açılmış.</b><br>Tarayıcı, dosyadan açılan ' +
      'sayfaların sunucuya bağlanmasına izin vermez. Dosyaları siteye yükleyip ' +
      '<b>https://</b> ile başlayan adresten açın.</div></div>');
    return;
  }

  // adresten gelen bağlantı bilgisi (işverene gönderilen bağlantı)
  try{
    var q = new URLSearchParams(location.search);
    if(q.get("u") && q.get("k")){
      yaz("sp_url", q.get("u")); yaz("sp_key", q.get("k"));
      history.replaceState(null, "", location.pathname);
    }
  }catch(e){}

  cfg.url = oku("sp_url"); cfg.key = oku("sp_key");
  kabukKur();
  baglan();
}

/* ---------- ortak çizimler ---------- */
function kutular(el, liste){
  el.innerHTML = liste.map(function(x){
    return '<div class="kutu '+(x[3]||"")+'"><div class="k">'+esc(x[0])+'</div>' +
      '<div class="v num">'+x[1]+'</div>' +
      '<div class="a">'+(x[2]||"")+'</div></div>';
  }).join("");
}
function tablo(cols, rows, bos, foot){
  if(!rows || !rows.length) return '<div class="hint" style="padding:12px 15px">'+esc(bos||"Kayıt yok.")+'</div>';
  return '<div class="scroll"><table><thead><tr>' +
    cols.map(function(c){ return '<th>'+c[0]+'</th>'; }).join("") + '</tr></thead><tbody>' +
    rows.map(function(r){ return '<tr>' +
      cols.map(function(c){ return '<td>'+c[1](r)+'</td>'; }).join("") + '</tr>'; }).join("") +
    '</tbody>'+(foot?'<tfoot><tr>'+foot+'</tr></tfoot>':'')+'</table></div>';
}
function cubuklar(el, rows, anahtar, etiket, bicim, renk){
  if(!rows || !rows.length){ el.innerHTML = '<div class="hint">Veri yok.</div>'; return; }
  var mx = Math.max.apply(null, rows.map(function(r){ return Number(r[anahtar])||0; })) || 1;
  el.innerHTML = rows.map(function(r){
    var v = Number(r[anahtar])||0;
    return '<div class="bar"><span>'+esc(r[etiket])+'</span><span class="track"><i style="width:' +
      (v/mx*100)+'%'+(renk?';background:'+renk(v):'')+'"></i></span>' +
      '<span class="val">'+bicim(v)+'</span></div>';
  }).join("");
}

/* ---------- sondaj görselleri ---------- */
var CAP_RENK = {PQ:"var(--pq)", HQ:"var(--hq)", NQ:"var(--nq)", PW:"var(--pw)"};

function kuleKart(k){
  var svg = '<svg class="sil" viewBox="0 0 40 48" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round"><path d="M20 3v30"/><path d="M8 33 20 5l12 28"/>' +
    '<path d="M11.5 26h17M13.5 20h13M15.5 14h9"/><path d="M4 33h32"/><path d="M20 33v6"/>' +
    '<path d="M14 39h12l-1.6 6H15.6z" fill="currentColor" fill-opacity=".14"/></svg>';
  return '<div class="kule '+(k.durum||"bosta")+'">'+svg+
    '<div class="gvd">' +
      '<div class="ust"><span class="kod">'+esc(k.kod)+'</span>' +
        '<span class="drm"><i></i>'+esc(k.etiket||"")+'</span></div>' +
      '<div class="kuyu">'+esc(k.kuyu||"—")+'</div>' +
      '<div class="der num">'+(k.derinlik ? tl(k.derinlik)+'<small> m</small>' : "—")+'</div>' +
    '</div></div>';
}

/* Kuyu kesiti. p = well_profile() çıktısı */
function kuyuKesiti(p){
  var plan = Number(p.planlanan) || Number(p.derinlik) || 100;
  var simdi = Number(p.derinlik) || 0;
  if(plan < simdi) plan = simdi;
  var H = 340, W = 300, X = 96, GEN = 52, UST = 26;
  var m2p = function(m){ return UST + (plan ? m/plan*H : 0); };
  var adim = plan > 600 ? 100 : (plan > 250 ? 50 : (plan > 100 ? 25 : 10));

  var s = '<svg viewBox="0 0 '+W+' '+(H+54)+'" width="100%" style="max-width:300px">';
  s += '<line x1="16" y1="'+UST+'" x2="'+(W-10)+'" y2="'+UST+'" stroke="#c9d7de" stroke-width="1.4"/>';
  s += '<text x="16" y="'+(UST-8)+'" font-size="10" fill="#7e9aa8">Zemin 0,00 m</text>';
  for(var d=0; d<=plan+0.01; d+=adim){
    var y = m2p(d);
    s += '<line x1="70" y1="'+y+'" x2="78" y2="'+y+'" stroke="#c9d7de" stroke-width="1"/>';
    s += '<text x="64" y="'+(y+3.4)+'" font-size="9.5" text-anchor="end" fill="#7e9aa8">'+d+'</text>';
  }
  s += '<text x="64" y="'+(m2p(plan)+20)+'" font-size="9" text-anchor="end" fill="#7e9aa8">metre</text>';
  s += '<rect x="'+X+'" y="'+UST+'" width="'+GEN+'" height="'+H+'" fill="#f0f4f7" ' +
       'stroke="#dbe5ea" stroke-width="1" rx="2"/>';

  (p.caplar||[]).forEach(function(g){
    var b = Number(g.bas)||0, so = Number(g.son)||0;
    if(so <= b) return;
    var y = m2p(b), h = m2p(so) - m2p(b);
    s += '<rect x="'+X+'" y="'+y+'" width="'+GEN+'" height="'+h+'" fill="' +
         (CAP_RENK[g.cap] || "var(--accent)") + '"/>';
    if(h > 19) s += '<text x="'+(X+GEN/2)+'" y="'+(y+h/2+4)+'" font-size="11.5" font-weight="600" ' +
      'fill="#fff" text-anchor="middle" font-family="Barlow Condensed">'+esc(g.cap)+'</text>';
  });

  (p.olcumler||[]).forEach(function(o){
    if(o.derinlik == null) return;
    var y = m2p(Number(o.derinlik));
    s += '<circle cx="'+(X+GEN+9)+'" cy="'+y+'" r="3.1" fill="#fff" stroke="var(--accent)" stroke-width="1.6"/>';
  });
  if((p.olcumler||[]).length)
    s += '<text x="'+(X+GEN+16)+'" y="'+(UST+12)+'" font-size="9.5" fill="#7e9aa8">ölçüm</text>';

  if(simdi > 0){
    var my = m2p(simdi);
    s += '<line x1="'+(X-14)+'" y1="'+my+'" x2="'+(X+GEN+6)+'" y2="'+my+'" stroke="#0d1f2b" stroke-width="1.6"/>';
    s += '<rect x="'+(X-14)+'" y="'+(my+4)+'" width="96" height="17" rx="4" fill="#0d1f2b"/>';
    s += '<text x="'+(X-8)+'" y="'+(my+16)+'" font-size="10.5" fill="#fff">'+tl(simdi)+' m · şu an</text>';
  }
  if(p.planlanan){
    var py = m2p(plan);
    s += '<line x1="'+(X-10)+'" y1="'+py+'" x2="'+(X+GEN+10)+'" y2="'+py+'" stroke="#9db4c0" ' +
         'stroke-width="1.4" stroke-dasharray="4 3"/>';
    s += '<text x="'+(X+GEN+14)+'" y="'+(py+3.4)+'" font-size="9.5" fill="#7e9aa8">plan '+tl(plan,0)+' m</text>';
  }
  return s + '</svg>';
}

var AKT_AD = {delgi:"Delgi", manevra:"Manevra", kuyu_hazirlik:"Kuyu hazırlığı",
  ariza:"Arıza", bekleme:"Bekleme", tasima:"Taşıma", bakim:"Bakım", diger:"Diğer"};
var AKT_RENK = {delgi:"#12708f", manevra:"#4bb3d6", kuyu_hazirlik:"#a8815a",
  ariza:"#a93a2f", bekleme:"#c9a227", tasima:"#7e9aa8", bakim:"#6f5b9a", diger:"#9db4c0"};

function aktiviteSeridi(satirlar){
  var top = (satirlar||[]).reduce(function(a,b){ return a + Number(b.saat||0); }, 0);
  if(!top) return '<div class="hint">Bu vardiya için aktivite saati girilmemiş.</div>';
  var s = '<div class="serit">' + satirlar.map(function(a){
    var g = Number(a.saat)/top*100;
    return '<i style="width:'+g+'%;background:'+(AKT_RENK[a.tur]||"#9db4c0")+'">' +
      (g > 7 ? '<span>'+tl(a.saat,1)+' sa</span>' : '') + '</i>';
  }).join("") + '</div>';
  s += '<div class="serit-lejant">' + satirlar.map(function(a){
    return '<span><i style="background:'+(AKT_RENK[a.tur]||"#9db4c0")+'"></i>' +
      esc(AKT_AD[a.tur]||a.tur)+' '+tl(a.saat,1)+' sa</span>';
  }).join("") + '</div>';
  return s;
}

function antet(sag){
  var lg = (erisim && erisim.logo) ? erisim.logo : "logo-mark.png";
  return '<img src="'+esc(lg)+'" alt="" onerror="this.onerror=null;this.src=\'icon.svg\'">' +
    '<div class="ad">'+esc(erisim ? erisim.firma : "")+'</div>' +
    '<div class="sg">'+esc(sag||"")+'</div>';
}

/* ---------- dışa açılan arayüz ---------- */
var API = {
  boot: boot, sb: null,
  get erisim(){ return erisim; },
  yetki: function(){ return AYAR.yetki; },
  girebilir: function(){ return AYAR.yetki === "gir"; },
  sayfaVar: function(k){ return !!(erisim && erisim.sayfalar && erisim.sayfalar[k]); },
  modulVar: function(m){ return !!(erisim && (erisim.moduller||[]).indexOf(m) > -1); },
  arac: function(html){ var e = $("#sp-arac"); if(e) e.innerHTML = html; },
  ayarlar: ayarlarAc, tema: temaOku, temaSec: temaYaz, yaziSec: yaziYaz,
  get bicim(){ return BICIM; },
  baslik: function(t){ AYAR.baslik = t; var e = $("#sp-baslik"); if(e) e.textContent = t; },
  $:$, $$:$$, esc:esc, tl:tl, money:money, iso:iso, trd:trd, msg:msg, bashrf:bashrf,
  AYLAR:AYLAR, ikon:ikon, kutular:kutular, tablo:tablo, cubuklar:cubuklar,
  kuleKart:kuleKart, kuyuKesiti:kuyuKesiti, aktiviteSeridi:aktiviteSeridi,
  AKT_AD:AKT_AD, AKT_RENK:AKT_RENK, CAP_RENK:CAP_RENK, antet:antet
};
return API;
})();
