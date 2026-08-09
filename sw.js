/* sw.js — faz o app abrir sem internet.
   Desbugando a Matemática · correção de provas

   Guarda todos os arquivos no aparelho na primeira visita. Depois disso
   o app abre offline, e os dados (turmas, provas, notas) já eram locais
   desde sempre — ficam no armazenamento do navegador, não em servidor.

   AO PUBLICAR UMA VERSÃO NOVA: troque o número em VERSAO. É isso que
   avisa o celular de que há atualização; sem trocar, ele continua
   servindo a versão guardada. */
const VERSAO = "v2";
const CACHE = "dbm-omr-" + VERSAO;

/* Tudo que o app precisa para funcionar sozinho. */
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./layout.js",
  "./embaralho.js",
  "./gerador.js",
  "./fonte.js",
  "./jsqr.js",
  "./jspdf.umd.min.js",
  "./qrcode.min.js",
  "./mammoth.browser.min.js",
  "./pdf.min.js",
  "./pdf.worker.min.js",
  "./standard_fonts/LiberationSans-Regular.ttf",
  "./standard_fonts/LiberationSans-Bold.ttf",
  "./standard_fonts/LiberationSans-Italic.ttf",
  "./standard_fonts/LiberationSans-BoldItalic.ttf",
  "./standard_fonts/FoxitSerif.pfb",
  "./standard_fonts/FoxitSerifBold.pfb",
  "./standard_fonts/FoxitSerifItalic.pfb",
  "./standard_fonts/FoxitSerifBoldItalic.pfb",
  "./standard_fonts/FoxitFixed.pfb",
  "./standard_fonts/FoxitFixedBold.pfb",
  "./standard_fonts/FoxitFixedItalic.pfb",
  "./standard_fonts/FoxitFixedBoldItalic.pfb",
  "./standard_fonts/FoxitSymbol.pfb",
  "./standard_fonts/FoxitDingbats.pfb"
];

/* Guarda um arquivo, tentando de novo antes de desistir. Devolve
   true/false para sabermos exatamente o que ficou de fora. */
async function guardar(cache, url, tentativas) {
  for (let i = 0; i < (tentativas || 2); i++) {
    try {
      const resp = await fetch(new Request(url, {cache: "reload"}));
      if (resp && resp.ok) { await cache.put(url, resp.clone()); return true; }
    } catch (e) { /* tenta de novo */ }
  }
  console.warn("[sw] não consegui guardar", url);
  return false;
}

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const falhas = [];
    /* Em série: baixar 27 arquivos de uma vez satura a rede do celular
       e é justamente aí que os maiores (o worker de 1 MB) falhavam. */
    for (const url of ARQUIVOS) {
      const ok = await guardar(cache, url);
      if (!ok) falhas.push(url);
    }
    await self.clients.claim();
    avisarClientes({tipo: "instalado", falhas});
  })());
});

async function avisarClientes(msg) {
  const cs = await self.clients.matchAll({includeUncontrolled: true});
  cs.forEach(c => c.postMessage(msg));
}

/* Responde ao app quais arquivos estão realmente guardados. */
async function conferir() {
  const cache = await caches.open(CACHE);
  const faltando = [];
  for (const url of ARQUIVOS) {
    const m = await cache.match(url);
    if (!m) faltando.push(url);
  }
  return {total: ARQUIVOS.length, faltando, versao: VERSAO};
}

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n.startsWith("dbm-omr-") && n !== CACHE)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", ev => {
  if (ev.data === "assumir") return self.skipWaiting();

  if (ev.data === "conferir") {
    ev.waitUntil((async () => {
      const r = await conferir();
      (ev.source ? [ev.source] : await self.clients.matchAll())
        .forEach(c => c.postMessage({tipo: "conferencia", ...r}));
    })());
  }

  if (ev.data === "completar") {
    ev.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const {faltando} = await conferir();
      const restam = [];
      for (const url of faltando) {
        const ok = await guardar(cache, url, 3);
        if (!ok) restam.push(url);
      }
      const r = await conferir();
      (ev.source ? [ev.source] : await self.clients.matchAll())
        .forEach(c => c.postMessage({tipo: "conferencia", ...r, completou: true}));
    })());
  }
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* A chamada à API da Claude nunca é guardada: precisa de rede e a
     resposta muda a cada prova. Offline, ela falha e o app avisa. */
  if (url.hostname === "api.anthropic.com") return;

  /* Fontes do Google: guarda na primeira vez que carregarem, para o
     app não ficar sem tipografia quando estiver sem rede. */
  const externa = url.origin !== self.location.origin;

  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req, {ignoreSearch: false});

    if (guardado) {
      /* Serve do aparelho e, se houver rede, atualiza em segundo plano. */
      atualizarDepois(cache, req);
      return guardado;
    }

    try {
      const resp = await fetch(req);
      if (resp && (resp.ok || resp.type === "opaque")) {
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    } catch (e) {
      /* Sem rede e sem cópia guardada. Se for navegação, devolve o app. */
      if (req.mode === "navigate") {
        const raiz = await cache.match("./index.html");
        if (raiz) return raiz;
      }
      if (externa) return new Response("", {status: 504});
      throw e;
    }
  })());
});

function atualizarDepois(cache, req) {
  fetch(req).then(resp => {
    if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
  }).catch(() => {});
}
