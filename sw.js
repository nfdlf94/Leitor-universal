/* sw.js — faz o app abrir sem internet.
   Desbugando a Matemática · correção de provas

   AO PUBLICAR UMA VERSÃO NOVA: troque o número em VERSAO. */
const VERSAO = "v3";
const CACHE = "dbm-omr-" + VERSAO;

/* O que o app precisa para ABRIR e corrigir provas. A instalação só
   termina quando tudo isto estiver guardado. */
const ESSENCIAIS = [
  "./",
  "./index.html",
  "./layout.js",
  "./embaralho.js",
  "./gerador.js",
  "./fonte.js",
  "./jsqr.js",
  "./jspdf.umd.min.js",
  "./qrcode.min.js",
  "./manifest.webmanifest"
];

/* Peso pesado: só é preciso para LER prova de arquivo. Baixa depois,
   em segundo plano, para não atrasar (nem derrubar) a instalação. */
const EXTRAS = [
  "./pdf.min.js",
  "./pdf.worker.min.js",
  "./mammoth.browser.min.js",
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
const ARQUIVOS = ESSENCIAIS.concat(EXTRAS);

/* Casar pedido com cópia guardada IGNORANDO o cabeçalho Vary. O GitHub
   Pages responde com "Vary: Accept-Encoding", e sem isto o navegador
   considera que a cópia não serve — era por aqui que a abertura a frio
   falhava, mesmo com o arquivo guardado. */
const OPCOES = {ignoreVary: true};

async function pegar(url) {
  const cache = await caches.open(CACHE);
  return (await cache.match(url, OPCOES)) ||
         (await cache.match(url, {ignoreVary: true, ignoreSearch: true}));
}

async function guardar(cache, url, tentativas) {
  for (let i = 0; i < (tentativas || 2); i++) {
    try {
      const resp = await fetch(new Request(url, {cache: "reload"}));
      if (resp && resp.ok) { await cache.put(url, resp.clone()); return true; }
    } catch (e) { /* tenta de novo */ }
  }
  console.warn("[sw] nao consegui guardar", url);
  return false;
}

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const falhas = [];
    for (const url of ESSENCIAIS) {
      if (!await guardar(cache, url, 3)) falhas.push(url);
    }
    /* Assume o controle já nesta visita: sem isto, a primeira abertura
       offline acontece antes de o worker estar no comando. */
    await self.skipWaiting();
    if (falhas.length) console.warn("[sw] essenciais que faltaram:", falhas);
  })());
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n.startsWith("dbm-omr-") && n !== CACHE)
      .map(n => caches.delete(n)));
    await self.clients.claim();
    baixarExtras();               // segue baixando o resto em segundo plano
  })());
});

async function baixarExtras() {
  const cache = await caches.open(CACHE);
  const falhas = [];
  for (const url of EXTRAS) {
    if (await cache.match(url, OPCOES)) continue;
    if (!await guardar(cache, url, 2)) falhas.push(url);
  }
  avisarClientes({tipo: "extras", falhas: falhas});
}

async function avisarClientes(msg) {
  const cs = await self.clients.matchAll({includeUncontrolled: true});
  cs.forEach(c => c.postMessage(msg));
}

async function conferir() {
  const cache = await caches.open(CACHE);
  const faltando = [];
  for (const url of ARQUIVOS) {
    const m = await cache.match(url, OPCOES);
    if (!m) faltando.push(url);
  }
  return {total: ARQUIVOS.length, faltando: faltando, versao: VERSAO};
}

self.addEventListener("message", ev => {
  if (ev.data === "assumir") return self.skipWaiting();

  if (ev.data === "conferir" || ev.data === "completar") {
    ev.waitUntil((async () => {
      if (ev.data === "completar") {
        const cache = await caches.open(CACHE);
        const pendentes = (await conferir()).faltando;
        for (const url of pendentes) await guardar(cache, url, 3);
      }
      const r = await conferir();
      const alvos = ev.source ? [ev.source] : await self.clients.matchAll();
      alvos.forEach(c => c.postMessage(Object.assign({tipo: "conferencia"}, r)));
    })());
  }
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* A API da Claude nunca é guardada: precisa de rede de qualquer jeito. */
  if (url.hostname === "api.anthropic.com") return;

  /* ABERTURA DA PÁGINA — o caso que estava quebrando a frio.
     Tenta a rede; sem rede, entrega o index guardado. */
  if (req.mode === "navigate") {
    ev.respondWith((async () => {
      try {
        const rede = await fetch(req);
        if (rede && rede.ok) {
          const cache = await caches.open(CACHE);
          cache.put("./index.html", rede.clone()).catch(() => {});
          return rede;
        }
      } catch (e) { /* offline: segue para o cache */ }

      const guardado = (await pegar("./index.html")) || (await pegar("./"));
      if (guardado) return guardado;

      return new Response(
        '<!doctype html><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="background:#071324;color:#E8ECF3;font-family:system-ui;padding:28px;line-height:1.6">' +
        '<h2 style="color:#F97316">App ainda nao guardado</h2>' +
        '<p>Este aparelho nao chegou a baixar o aplicativo por completo.</p>' +
        '<p>Conecte-se a internet e abra esta pagina uma vez. Depois disso ' +
        'ela passa a funcionar sem conexao.</p></body>',
        {headers: {"Content-Type": "text/html; charset=utf-8"}});
    })());
    return;
  }

  /* Demais arquivos: primeiro o que está no aparelho. */
  ev.respondWith((async () => {
    const guardado = await pegar(req.url);
    if (guardado) { atualizarDepois(req); return guardado; }
    try {
      const resp = await fetch(req);
      if (resp && resp.ok && url.origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(req.url, resp.clone()).catch(() => {});
      }
      return resp;
    } catch (e) {
      if (url.origin !== self.location.origin) return new Response("", {status: 504});
      throw e;
    }
  })());
});

function atualizarDepois(req) {
  fetch(req).then(async resp => {
    if (resp && resp.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req.url, resp.clone()).catch(() => {});
    }
  }).catch(() => {});
}
