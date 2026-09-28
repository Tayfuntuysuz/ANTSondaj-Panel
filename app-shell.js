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

/* ---------- yardımcılar ---------- */
var $  = function(s, k){ return (k||document).querySelector(s); };
var $$ = function(s, k){ return Array.prototype.slice.call((k||document).querySelectorAll(s)); };
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); }
function tl(n,d){ d=(d===undefined?2:d);
  return Number(n||0).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function money(n){ return "₺"+Number(n||0).toLocaleString("tr-TR",{maximumFractionDigits:0}); }
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
  saat:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
function ikon(k){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '+
         'stroke-linecap="round" stroke-linejoin="round">'+(IC[k]||IC.pano)+'</svg>';
}

/* ---------- menü tanımı: sayfa anahtarı -> dosya, ad, ikon, grup ---------- */
var SAYFALAR = [
  {k:"panel",    d:"panel.html",     ad:"Genel bakış",        i:"pano",   g:"Genel"},
  {k:"rapor",    d:"rapor.html",     ad:"Aylık rapor",        i:"rapor",  g:"Genel"},
  {k:"saha",     d:"index.html",     ad:"Vardiya girişi",     i:"kule",   g:"Günlük iş"},
  {k:"puantaj",  d:"index.html#puantaj", ad:"Puantaj",        i:"kisi",   g:"Günlük iş"},
  {k:"kuyular",  d:"panel.html#kuyular", ad:"Kuyular",        i:"kuyu",   g:"Saha"},
  {k:"sefozet",  d:"panel.html",     ad:"Saha özetim",        i:"pano",   g:"Saham"},
  {k:"sirket",   d:"sirket.html",    ad:"Şirket performansı", i:"para",   g:"Analiz"},
  {k:"ofis",     d:"ofis.html",      ad:"Merkez ofis",        i:"ofis",   g:"Analiz"},
  {k:"maaslar",  d:"maaslar.html",   ad:"Maaş tablosu",       i:"kisi",   g:"Analiz"},
  {k:"muhasebe", d:"muhasebe.html",  ad:"Muhasebe",           i:"para",   g:"Finans"},
  {k:"hakedis",  d:"muhasebe.html#fatura", ad:"Hakediş",      i:"rapor",  g:"Finans"},
  {k:"kullanicilar", d:"ofis.html#kullanicilar", ad:"Kullanıcılar", i:"ayar", g:"Yönetim"},
  {k:"isveren",  d:"isveren.html",   ad:"Raporlarım",         i:"kalkan", g:"Raporlar"}
];
var GRUP_SIRA = ["Genel","Günlük iş","Saha","Saham","Analiz","Finans","Raporlar","Yönetim"];

/* ---------- durum ---------- */
var sb = null, erisim = null, cfg = {url:"", key:""}, AYAR = {};

function oku(k){ try{ return localStorage.getItem(k) || ""; }catch(e){ return ""; } }
function yaz(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

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
      '<div class="foot">Sürüm 2.0</div>' +
    '</aside>' +
    '<div class="sp-main">' +
      '<div class="sp-top">' +
        '<div><div class="yol" id="sp-yol"></div><h1 id="sp-baslik"></h1></div>' +
        '<div class="sp"><span id="sp-arac"></span>' +
          '<div class="sp-kisi"><span class="av" id="sp-av"></span>' +
          '<span><span class="ad" id="sp-ad"></span><br>' +
          '<span class="rol" id="sp-rol2"></span></span></div>' +
          '<button class="btn gh sm" id="sp-cikis" type="button">Çıkış</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(s);
  var ic = $("#sp-icerik");
  if(ic){ $(".sp-main", s).appendChild(ic); }
  else { var d=document.createElement("div"); d.id="sp-icerik"; d.className="sp-icerik";
         $(".sp-main", s).appendChild(d); }
  $("#sp-icerik").classList.add("sp-icerik");
  $("#sp-cikis").addEventListener("click", function(){
    if(!sb){ location.reload(); return; }
    sb.auth.signOut().then(function(){ location.reload(); });
  });
  return s;
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
      yetkiAl();
    }).catch(function(x){ msg($("#gr-msg"), esc(String(x && x.message || x)), "err"); });
  };
  $("#gr-btn").addEventListener("click", dene);
  $("#gr-pass").addEventListener("keydown", function(e){ if(e.key === "Enter") dene(); });
}

function uyariEkrani(baslik, metin){
  temizle();
  tamEkran('<div class="sp-orta"><h2>'+esc(baslik)+'</h2>' +
    '<div class="msg err">'+metin+'</div>' +
    '<button class="btn gh" onclick="location.href=\'index.html\'">Başlangıç sayfası</button></div>');
}

/* ---------- menü ---------- */
function menuKur(){
  var izin = erisim.sayfalar || {};
  var gruplar = {};
  SAYFALAR.forEach(function(s){
    var y = izin[s.k]; if(!y) return;
    (gruplar[s.g] = gruplar[s.g] || []).push({s:s, y:y});
  });
  var html = GRUP_SIRA.filter(function(g){ return gruplar[g]; }).map(function(g){
    return '<div class="sp-grp"><div class="lbl">'+esc(g)+'</div><nav class="sp-nav">' +
      gruplar[g].map(function(x){
        var aktif = (x.s.k === AYAR.sayfa);
        return '<a href="'+x.s.d+'" class="'+(aktif?"on":"")+'">'+ikon(x.s.i) +
               '<span>'+esc(x.s.ad)+'</span>' +
               (x.y === "gir" ? '<span class="tag">giriş</span>' : '') + '</a>';
      }).join("") + '</nav></div>';
  }).join("");
  $("#sp-menu").innerHTML = html || '<div class="sp-grp"><div class="lbl">Menü boş</div></div>';
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
    var izin = (erisim.sayfalar || {})[AYAR.sayfa];
    if(!izin){
      uyariEkrani("Bu sayfaya erişiminiz yok",
        "<b>"+esc(erisim.rol_adi||"")+"</b> rolü bu sayfayı görüntüleyemiyor. " +
        "Yetki gerekiyorsa yöneticinizle görüşün.");
      return;
    }
    AYAR.yetki = izin;
    $("#sp-shell").hidden = false;
    menuKur(); ustKur();
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
    '<div><div class="kod">'+esc(k.kod)+'</div><div class="kuyu">'+esc(k.kuyu||"—")+'</div>' +
    '<div class="der num">'+(k.derinlik ? tl(k.derinlik)+'<small> m</small>' : "—")+'</div></div>' +
    '<div class="drm"><i></i>'+esc(k.etiket||"")+'</div></div>';
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
  baslik: function(t){ AYAR.baslik = t; var e = $("#sp-baslik"); if(e) e.textContent = t; },
  $:$, $$:$$, esc:esc, tl:tl, money:money, iso:iso, trd:trd, msg:msg, bashrf:bashrf,
  AYLAR:AYLAR, ikon:ikon, kutular:kutular, tablo:tablo, cubuklar:cubuklar,
  kuleKart:kuleKart, kuyuKesiti:kuyuKesiti, aktiviteSeridi:aktiviteSeridi,
  AKT_AD:AKT_AD, AKT_RENK:AKT_RENK, CAP_RENK:CAP_RENK, antet:antet
};
return API;
})();
