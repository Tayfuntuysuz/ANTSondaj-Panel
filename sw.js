/* Sondaj Panel — çevrimdışı uygulama kabuğu
   Sayfalar: önce ağ, olmazsa önbellek (güncellemeler hemen görünür).
   Diğer dosyalar: önce önbellek. */
var CACHE = "sondaj-panel-v44";
/* 57. dosya: yonetim.html ("Ana veri ve projeler") listede HİÇ yoktu —
   bağlantı zayıfken o sayfa doğrudan şefin ekranına düşüyordu.
   Yeni sayfa eklendiğinde (aykilidi.html, hakedis.html) buraya da
   eklenecek. */
var SHELL = [
  "./", "./index.html", "./panel.html", "./rapor.html", "./santiyeler.html",
  "./sirket.html", "./maaslar.html", "./ofis.html", "./muhasebe.html", "./isveren.html",
  "./yonetim.html",
  "./app.css", "./app-shell.js", "./kart.js",
  "./manifest.webmanifest", "./icon.svg", "./logo.png", "./logo-mark.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(SHELL.map(function(u){
      return c.add(new Request(u, {cache:"reload"})).catch(function(){});
    }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function isPage(req){
  return req.mode === "navigate" ||
         (req.headers.get("accept") || "").indexOf("text/html") > -1;
}

/* 57. dosya: çevrimdışı son çare BAŞKA ROLÜN UYGULAMASI olmayacak.
   Eskiden getirilemeyen her sayfa "./index.html"e düşüyordu; yönetici
   bağlantısı bir an kopunca kendini saha ekranında buluyordu. Artık
   istenen sayfanın kendi önbelleği, o da yoksa kısa bir not. */
function cevrimdisiNot(url){
  var ad = String(url && url.pathname || "").split("/").pop() || "sayfa";
  return new Response(
    '<!doctype html><html lang="tr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Çevrimdışısınız</title><style>' +
    'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;' +
    'min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#f6f7f9;color:#1b1f24;padding:24px}' +
    '.k{max-width:380px;text-align:center;background:#fff;border:1px solid #e3e6ea;' +
    'border-radius:14px;padding:26px}' +
    'h1{font-size:19px;margin:0 0 10px}p{font-size:14px;line-height:1.5;color:#55606c;margin:0 0 16px}' +
    'button{width:100%;padding:13px;border-radius:10px;border:1px solid #1b4ed8;' +
    'background:#1b4ed8;color:#fff;font-weight:600;font-size:15px;cursor:pointer}' +
    '</style></head><body><div class="k"><h1>Çevrimdışısınız</h1>' +
    '<p><b>' + ad.replace(/[&<>"]/g, "") + '</b> sayfası bu cihazda kayıtlı değil, ' +
    'bağlantı da yok. Bağlantı gelince yeniden deneyin.</p>' +
    '<button onclick="location.reload()">Yeniden dene</button></div></body></html>',
    {status:503, headers:{"Content-Type":"text/html; charset=utf-8"}});
}

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  if(url.pathname.indexOf("/rest/v1") === 0 || url.pathname.indexOf("/auth/v1") === 0 ||
     url.pathname.indexOf("/storage/v1") === 0) return;   // Supabase doğrudan gitsin

  if(isPage(req)){
    // önce ağ: yeni sürüm varsa hemen görünür
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){ return hit || cevrimdisiNot(url); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        if(res && res.status === 200 && (url.origin === location.origin ||
           url.host.indexOf("jsdelivr") > -1 || url.host.indexOf("cdnjs") > -1 || url.host.indexOf("gstatic") > -1 || url.host.indexOf("googleapis") > -1)){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        /* Eksik bir betik/stil yerine HTML döndürmek sayfayı sessizce
           bozuyordu; dürüst cevap 504. */
        return new Response("", {status:504, statusText:"cevrimdisi"});
      });
    })
  );
});
