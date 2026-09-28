/* Sondaj Panel — çevrimdışı uygulama kabuğu
   Sayfalar: önce ağ, olmazsa önbellek (güncellemeler hemen görünür).
   Diğer dosyalar: önce önbellek. */
var CACHE = "sondaj-panel-v22";
var SHELL = [
  "./", "./index.html", "./panel.html", "./rapor.html", "./santiyeler.html",
  "./sirket.html", "./maaslar.html", "./ofis.html", "./muhasebe.html", "./isveren.html",
  "./app.css", "./app-shell.js",
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
        return caches.match(req).then(function(hit){ return hit || caches.match("./index.html"); });
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
      }).catch(function(){ return caches.match("./index.html"); });
    })
  );
});
