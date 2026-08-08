/* gerador.js — monta as provas personalizadas em PDF, no próprio navegador
   Desbugando a Matemática

   Espelho de cartao_omr.py. A geometria vem de layout.js e o embaralhamento
   de embaralho.js, exatamente como no pipeline em Python — de modo que um
   cartão gerado aqui e um gerado lá são o mesmo cartão.

   Depende de: layout.js, embaralho.js, fonte.js, jspdf.umd.min.js, qrcode.min.js

   O texto das questões usa a fonte embutida DBMSans (DejaVu reduzida), que
   cobre os símbolos matemáticos — as fontes internas do jsPDF param no
   Latin-1 e engolem ∩, ⊂, √, π, ³. Os rótulos do cartão continuam em
   Helvetica, para ficarem idênticos aos do gerador em Python.
*/
"use strict";

let FONTE_TEXTO = "helvetica";      // vira "DBMSans" quando fonte.js está presente

function prepararFontes(doc){
  if(typeof registrarFontes === "function"){
    try{ registrarFontes(doc); FONTE_TEXTO = "DBMSans"; }
    catch(e){ console.warn("fonte embutida indisponível, usando Helvetica", e);
              FONTE_TEXTO = "helvetica"; }
  } else FONTE_TEXTO = "helvetica";
  return FONTE_TEXTO;
}

const COR = {
  navy:  [14, 33, 69],
  orange:[249, 115, 22],
  grey:  [158, 166, 179],
  zebra: [245, 246, 249],
  preto: [0, 0, 0],
  branco:[255, 255, 255]
};

/* ── nome abreviado para caber no QR (espelho de encurtar_nome) ──── */
const NOME_MAX = 30;
function encurtarNome(nome, limite){
  const lim = limite || NOME_MAX;
  const p = String(nome||"").trim().toUpperCase().split(/\s+/).filter(Boolean);
  if(!p.length) return "";
  let nm = p.join(" "), i = 1;
  while(nm.length > lim && i < p.length - 1){
    p[i] = p[i][0] + "."; nm = p.join(" "); i++;
  }
  return nm.slice(0, lim);
}

function montarPayload(codigo, gabIndividual, turma, numero, nome, no){
  const gab = String(gabIndividual).toUpperCase();
  return ["DBM4", String(codigo).trim(), gab, String(turma).trim(),
          String(numero).trim(), encurtarNome(nome),
          assinaturaLayout(gab.length, no)].join("|");
}

/* ── gabarito individual: espelho de embaralho.py ─────────────────── */
function gabaritoIndividual(gabCanonico, turma, numero, no){
  const gab = String(gabCanonico).toUpperCase(), nq = gab.length;
  const letras = ["A","B","C","D","E"].slice(0, no);
  const {oq, oa} = embaralharProva(nq, no, turma, numero);
  let out = "";
  for(let p = 0; p < nq; p++){
    const certa = letras.indexOf(gab[oq[p]]);
    out += letras[oa[p].indexOf(certa)];
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   CARTÃO-RESPOSTA
   (x, y) = canto superior-esquerdo do fiducial superior-esquerdo,
   em mm a partir do canto superior-esquerdo da página.
   ═══════════════════════════════════════════════════════════════════ */
function desenharCartao(doc, opt){
  const gabC = String(opt.gabaritoCanonico).toUpperCase();
  const nq = gabC.length, no = opt.no || 5;
  const L = montarLayout(nq, no);
  const W = L.box_w, H = L.box_h, fid = L.fid_size, qz = L.quiet_zone, r = L.bubble_r;
  const gab = gabaritoIndividual(gabC, opt.turma, opt.numero, no);

  const cx = opt.x + fid/2, cy = opt.y + fid/2;      // centro do fiducial ↖
  const P = (mx, my) => [cx + mx, cy + my];

  // zona de silêncio
  doc.setFillColor(...COR.branco);
  doc.rect(cx - qz, cy - qz, W + 2*qz, H + 2*qz, "F");

  // moldura tracejada
  if(opt.moldura !== false){
    doc.setDrawColor(...COR.grey); doc.setLineWidth(0.5);
    if(doc.setLineDashPattern) doc.setLineDashPattern([3,3], 0);
    doc.rect(cx - (qz-1.5), cy - (qz-1.5), W + 2*(qz-1.5), H + 2*(qz-1.5), "S");
    if(doc.setLineDashPattern) doc.setLineDashPattern([], 0);
  }

  // fiduciais
  doc.setFillColor(...COR.preto);
  [[0,0],[W,0],[W,H],[0,H]].forEach(([mx,my])=>{
    const [px,py] = P(mx,my);
    doc.rect(px - fid/2, py - fid/2, fid, fid, "F");
  });

  // QR
  const payload = montarPayload(opt.codigo, gab, opt.turma, opt.numero, opt.nome, no);
  const q = qrcode(0, "M"); q.addData(payload); q.make();
  const n = q.getModuleCount(), passo = L.qr.size / n;
  const [qx, qy] = P(L.qr.x, L.qr.y);
  doc.setFillColor(...COR.preto);
  for(let i = 0; i < n; i++) for(let j = 0; j < n; j++)
    if(q.isDark(i, j)) doc.rect(qx + j*passo, qy + i*passo, passo*1.02, passo*1.02, "F");

  // rótulos
  doc.setTextColor(...COR.navy); doc.setFont("helvetica","bold"); doc.setFontSize(7);
  let [tx,ty] = P(L.qr.x + 2, 7.5); doc.text("CARTÃO-RESPOSTA", tx, ty);
  doc.setTextColor(...COR.orange); doc.setFontSize(6.5);
  [tx,ty] = P(L.qr.x + 2, L.qr.y + L.qr.size + 5.5);
  doc.text(((opt.turma||"") + "  " + (opt.numero||"")).trim() ||
           String(opt.codigo).toUpperCase().slice(0,16), tx, ty);
  doc.setTextColor(...COR.grey); doc.setFont("helvetica","normal"); doc.setFontSize(5.5);
  [tx,ty] = P(L.qr.x + 2, L.qr.y + L.qr.size + 10.5);
  doc.text(nq + " questões · A a " + L.options[no-1], tx, ty);

  // grade de bolhas
  const larguraFaixa = L.bubble_dx * (no - 1) + 2*r + 15;
  L.groups.forEach(g => {
    doc.setTextColor(...COR.grey); doc.setFont("helvetica","bold"); doc.setFontSize(6);
    L.options.forEach((letra, k) => {
      const [px,py] = P(g.first_bubble_x + k*L.bubble_dx, L.row_y[0] - r - 2.2);
      doc.text(letra, px, py, {align:"center"});
    });
    g.questions.forEach((qn, i) => {
      const yy = L.row_y[i];
      if(i % 2 === 1){
        doc.setFillColor(...COR.zebra);
        const [fx,fy] = P(g.label_x - 6, yy - r - 1.6);
        doc.rect(fx, fy, larguraFaixa, 2*r + 3.2, "F");
      }
      doc.setTextColor(...COR.navy); doc.setFont("helvetica","bold"); doc.setFontSize(8);
      const [nx,ny] = P(g.label_x, yy + 1.3);
      doc.text(String(qn).padStart(2,"0"), nx, ny, {align:"center"});

      doc.setDrawColor(...COR.navy); doc.setLineWidth(0.7); doc.setFillColor(...COR.branco);
      for(let k = 0; k < no; k++){
        const [bx,by] = P(g.first_bubble_x + k*L.bubble_dx, yy);
        doc.circle(bx, by, r, "FD");
      }
    });
  });
  return {altura: H + 2*qz, largura: W + 2*qz, gabarito: gab, payload};
}

/* ═══════════════════════════════════════════════════════════════════
   PROVA COMPLETA — uma por aluno, questões e alternativas embaralhadas
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   DIAGRAMAÇÃO DA PROVA
   Segue o modelo em uso: faixa da escola, identificação do estudante,
   cartão-resposta no alto, questões em duas colunas e rascunho no fim.
   O corpo do texto encolhe automaticamente até caber em 2 páginas.
   ═══════════════════════════════════════════════════════════════════ */
const MARG = 12, GUT = 7, TOPO = 12, MARGEM_INF = 10;
const MARGEM_CARTAO = 6;
const CORPOS = [10.5, 10];   // legibilidade tem piso: nunca menor que 10 pt

const larguraColuna = doc =>
  (doc.internal.pageSize.getWidth() - 2 * MARG - GUT) / 2;
const xColuna = (doc, c) => MARG + c * (larguraColuna(doc) + GUT);

/* ── cabeçalho ──────────────────────────────────────────────────── */
function cabecalho(doc, cfg, aluno, dry){
  const W = doc.internal.pageSize.getWidth(), util = W - 2 * MARG;
  const alturaFaixa = 13;
  if(!dry){
    doc.setFillColor(...COR.navy);
    doc.rect(0, 0, W, alturaFaixa, "F");
    doc.setTextColor(...COR.branco); doc.setFont(FONTE_TEXTO, "bold"); doc.setFontSize(9);
    doc.text(String(cfg.escola || "").toUpperCase(), MARG, 6);
    doc.setTextColor(...COR.orange); doc.setFontSize(7);
    doc.text([cfg.titulo || "AVALIAÇÃO DE APRENDIZAGEM", cfg.periodoLabel]
               .filter(Boolean).join("  •  ").toUpperCase(), MARG, 10.5);
  }
  let y = alturaFaixa + 5;

  // faixa de identificação: ALUNO(A) | TURMA | Nº
  const hLinha = 11, colTurma = util - 40, colNum = util - 16;
  if(!dry){
    doc.setDrawColor(...COR.grey); doc.setLineWidth(0.3);
    doc.rect(MARG, y, util, hLinha, "S");
    doc.line(MARG + colTurma, y, MARG + colTurma, y + hLinha);
    doc.line(MARG + colNum, y, MARG + colNum, y + hLinha);
    doc.setTextColor(...COR.grey); doc.setFont(FONTE_TEXTO, "bold"); doc.setFontSize(5.5);
    doc.text("ALUNO(A)", MARG + 2, y + 3.4);
    doc.text("TURMA", MARG + colTurma + 2, y + 3.4);
    doc.text("Nº", MARG + colNum + 2, y + 3.4);
    doc.setTextColor(...COR.navy); doc.setFont(FONTE_TEXTO, "bold"); doc.setFontSize(9);
    doc.text(String(aluno.nome || "").toUpperCase(), MARG + 2, y + 8.6);
    doc.text(String(cfg.turma || ""), MARG + colTurma + 2, y + 8.6);
    doc.text(String(aluno.numero || ""), MARG + colNum + 2, y + 8.6);
  }
  y += hLinha + 4;

  if(!dry){
    doc.setTextColor(80, 88, 100); doc.setFont(FONTE_TEXTO, "normal"); doc.setFontSize(7);
    const linha = "DISCIPLINA: " + (cfg.disciplina || "") +
      "        PROFESSOR: " + (cfg.professor || "") +
      "        DATA: ____ / ____ / ______";
    doc.text(linha, MARG, y);
  }
  return y + 4;
}

/* figura: nunca mais larga que a coluna nem mais alta que meia página */
const FIG_MAX_H = 52;
function medirFigura(img, larguraDisponivel){
  if(!img || !img.dados) return null;
  const pw = img.w || 400, ph = img.h || 300;
  const teto = larguraDisponivel || 78;
  let w = Math.min(teto, pw * 0.2646);          // px -> mm a ~96 dpi
  let h = w * ph / pw;
  if(h > FIG_MAX_H){ h = FIG_MAX_H; w = h * pw / ph; }
  return {w, h};
}

/* ── medidas de uma questão dentro da coluna ────────────────────── */
function medidasQuestao(doc, item, larg, fs, opcoes){
  doc.setFont(FONTE_TEXTO, "normal"); doc.setFontSize(fs);
  const passo = fs * 0.42;
  const linhasEnun = doc.splitTextToSize(String(item.enunciado || ""), larg);
  let h = 5.2 + linhasEnun.length * passo + 1.4;       // rótulo + enunciado
  const fig = medirFigura(item.imagem, larg);
  if(fig) h += fig.h + 2.5;
  const alts = (item.alternativas || []).map(a =>
    doc.splitTextToSize(String(a == null ? "" : a), larg - 7));
  alts.forEach(la => { h += la.length * passo + 0.9; });
  return {h, linhasEnun, alts, fig, passo};
}

function desenharQuestaoCol(doc, x, y, n, item, larg, fs, opcoes, m){
  doc.setTextColor(...COR.navy); doc.setFont(FONTE_TEXTO, "bold"); doc.setFontSize(fs - 1.5);
  doc.text("QUESTÃO " + String(n).padStart(2, "0"), x, y + 2.4);
  doc.setDrawColor(...COR.orange); doc.setLineWidth(0.6);
  doc.line(x, y + 3.6, x + 15, y + 3.6);
  y += 5.2;

  doc.setFont(FONTE_TEXTO, "normal"); doc.setFontSize(fs); doc.setTextColor(25, 28, 34);
  doc.text(m.linhasEnun, x, y + m.passo * 0.75);
  y += m.linhasEnun.length * m.passo + 1.4;

  if(m.fig){
    try{ doc.addImage(item.imagem.dados, "JPEG", x, y, m.fig.w, m.fig.h); }catch(e){}
    y += m.fig.h + 2.5;
  }
  m.alts.forEach((la, k) => {
    doc.setFont(FONTE_TEXTO, "bold"); doc.setTextColor(...COR.orange); doc.setFontSize(fs);
    doc.text(opcoes[k] + ")", x + 1, y + m.passo * 0.75);
    doc.setFont(FONTE_TEXTO, "normal"); doc.setTextColor(25, 28, 34);
    doc.text(la, x + 7, y + m.passo * 0.75);
    y += la.length * m.passo + 0.9;
  });
  return y + 3.4;
}

/* ── rascunho ───────────────────────────────────────────────────── */
function desenharRascunho(doc, y, altura){
  const W = doc.internal.pageSize.getWidth(), util = W - 2 * MARG;
  doc.setDrawColor(...COR.grey); doc.setLineWidth(0.3);
  if(doc.setLineDashPattern) doc.setLineDashPattern([2, 2], 0);
  doc.rect(MARG, y, util, altura, "S");
  if(doc.setLineDashPattern) doc.setLineDashPattern([], 0);
  doc.setTextColor(...COR.grey); doc.setFont(FONTE_TEXTO, "normal"); doc.setFontSize(6.5);
  doc.text("RASCUNHO — esta área não será corrigida", MARG + 3, y + 4.5);
}

/* ── fluxo: monta blocos e os distribui equilibrando as colunas ──── */
function blocosDaProva(doc, cfg, aluno, fs){
  const larg = larguraColuna(doc);
  const gabC = String(cfg.gabaritoCanonico).toUpperCase();
  const nq = gabC.length, no = cfg.no || 5;
  const opcoes = ["A", "B", "C", "D", "E"].slice(0, no);
  const {oq, oa} = embaralharProva(nq, no, cfg.turma, aluno.numero);
  const blocos = [];

  for(let p = 0; p < nq; p++){
    const base = (cfg.questoes || [])[oq[p]] ||
      {enunciado: "(questão " + (oq[p] + 1) + ")", alternativas: []};
    const item = {enunciado: base.enunciado, imagem: base.imagem,
      alternativas: oa[p].map(ci => (base.alternativas || [])[ci])};
    const m = medidasQuestao(doc, item, larg, fs, opcoes);
    blocos.push({h: m.h + 3.4, juntoComProximo: false,
      desenhar: (x, y) => desenharQuestaoCol(doc, x, y, p + 1, item, larg, fs, opcoes, m)});
  }

  const disc = cfg.discursivas || [];
  if(disc.length){
    blocos.push({h: 8, juntoComProximo: true, desenhar: (x, y) => {
      doc.setFillColor(...COR.navy);
      doc.rect(x, y, larg, 5.5, "F");
      doc.setTextColor(...COR.branco); doc.setFont(FONTE_TEXTO, "bold"); doc.setFontSize(6.5);
      doc.text("PARTE II — DISCURSIVAS", x + 2, y + 3.9);
      return y + 8;
    }});
    disc.forEach((q, i) => {
      doc.setFont(FONTE_TEXTO, "normal"); doc.setFontSize(fs);
      const passo = fs * 0.42;
      const linhas = doc.splitTextToSize(String(q.enunciado || ""), larg);
      const espaco = Math.max(14, (q.linhas || 4) * 5.5);
      const h = 5 + linhas.length * passo + espaco + 4;
      blocos.push({h, juntoComProximo: false, desenhar: (x, y) => {
        doc.setTextColor(...COR.navy); doc.setFont(FONTE_TEXTO, "bold"); doc.setFontSize(fs - 1.5);
        doc.text((i + 1) + ".  (" + (q.pontos != null ? q.pontos : "") + " pt)", x, y + 2.4);
        doc.setFont(FONTE_TEXTO, "normal"); doc.setFontSize(fs); doc.setTextColor(25, 28, 34);
        doc.text(linhas, x, y + 5 + passo * 0.75);
        let yy = y + 5 + linhas.length * passo + 2;
        doc.setDrawColor(210, 214, 220); doc.setLineWidth(0.25);
        for(let l = 0; l < Math.round(espaco / 5.5); l++)
          doc.line(x, yy + l * 5.5, x + larg, yy + l * 5.5);
        return y + h;
      }});
    });
  }
  return blocos;
}

/* Onde cortar uma página em duas colunas: o corte que deixa as colunas
   mais parecidas, sem estourar nenhuma. -1 se não couber. */
function melhorCorte(alturas, capacidade){
  const total = alturas.reduce((a, b) => a + b, 0);
  let melhor = -1, dif = Infinity;
  let esq = 0;
  for(let k = 1; k <= alturas.length; k++){
    esq += alturas[k - 1];
    const dir = total - esq;
    if(esq <= capacidade && dir <= capacidade){
      const d = Math.abs(esq - dir);
      if(d < dif){ dif = d; melhor = k; }
    }
  }
  return melhor;
}

function fluir(doc, cfg, aluno, fs, dry){
  const alturaPag = doc.internal.pageSize.getHeight();
  const fundo = alturaPag - MARGEM_INF;
  const gabC = String(cfg.gabaritoCanonico).toUpperCase();
  const nq = gabC.length, no = cfg.no || 5;

  let paginas = 1;
  let y = cabecalho(doc, cfg, aluno, dry);

  const L = montarLayout(nq, no);
  const altCartao = L.box_h + 2 * L.quiet_zone;
  if(!dry){
    desenharCartao(doc, {x: MARG + 2, y: y + L.quiet_zone,
      codigo: cfg.codigo, gabaritoCanonico: gabC, no,
      turma: cfg.turma, numero: aluno.numero, nome: aluno.nome});
  }
  const topoPrimeira = y + altCartao + 8;   // folga para não colidir com a moldura

  const blocos = blocosDaProva(doc, cfg, aluno, fs);
  const alturas = blocos.map(b => b.h);

  let i = 0, topo = topoPrimeira, ultimoUso = topo;
  while(i < blocos.length){
    const cap = fundo - topo;
    // maior conjunto de blocos que cabe nesta página, já equilibrado
    let leva = 0, corte = 1;
    for(let n = 1; i + n <= blocos.length; n++){
      const k = melhorCorte(alturas.slice(i, i + n), cap);
      if(k < 0) break;
      leva = n; corte = k;
    }
    if(leva === 0){ leva = 1; corte = 1; }   // bloco maior que a coluna: transborda

    if(!dry){
      let ye = topo, yd = topo;
      for(let n = 0; n < leva; n++){
        const b = blocos[i + n];
        if(n < corte){ ye = b.desenhar(xColuna(doc, 0), ye); }
        else { yd = b.desenhar(xColuna(doc, 1), yd); }
      }
      ultimoUso = Math.max(ye, yd);
    } else {
      const somaE = alturas.slice(i, i + corte).reduce((a, b) => a + b, 0);
      const somaD = alturas.slice(i + corte, i + leva).reduce((a, b) => a + b, 0);
      ultimoUso = topo + Math.max(somaE, somaD);
    }
    i += leva;
    if(i < blocos.length){
      // sobrou espaço embaixo desta página? vira rascunho, não vazio
      const folga = fundo - ultimoUso;
      if(!dry && folga >= 30) desenharRascunho(doc, ultimoUso + 3, folga - 3);
      paginas++;
      if(!dry) doc.addPage();
      topo = TOPO;
    }
  }

  // o rascunho é um bônus: só entra no espaço que sobrou, nunca
  // pede uma página nova — papel a mais não vale por área de rabisco
  const sobra = fundo - ultimoUso;
  if(!dry && sobra >= 26) desenharRascunho(doc, ultimoUso + 3, sobra - 3);
  return paginas;
}

/**
 * cfg = {codigo, titulo, escola, turma, disciplina, professor, periodoLabel,
 *        gabaritoCanonico, no, questoes:[...], discursivas:[...]}
 */
function gerarProvas(cfg, alunos, jsPDFctor){
  const Ctor = jsPDFctor || (window.jspdf && window.jspdf.jsPDF);
  const doc = new Ctor({unit: "mm", format: "a4", compress: true});
  prepararFontes(doc);

  if(typeof caracteresFaltando === "function"){
    const textos = [cfg.titulo, cfg.escola, cfg.disciplina, cfg.professor];
    (cfg.questoes || []).forEach(q => { textos.push(q.enunciado);
      (q.alternativas || []).forEach(a => textos.push(a)); });
    (cfg.discursivas || []).forEach(q => textos.push(q.enunciado));
    alunos.forEach(a => textos.push(a.nome));
    const fora = caracteresFaltando(textos);
    if(fora.length) doc.avisoCaracteres = fora;
  }

  /* Regra: gastar o menor número de folhas possível; havendo empate,
     usar a letra maior. Assim uma prova curta cabe em uma lauda só e
     uma longa cresce para três, sem nunca descer de 10 pt. */
  const molde = new Ctor({unit: "mm", format: "a4"});
  prepararFontes(molde);
  const referencia = alunos[0] || {numero: "01", nome: "MODELO"};
  const medidas = CORPOS.map(fs => ({fs, pgs: fluir(molde, cfg, referencia, fs, true)}));
  const minimo = Math.min(...medidas.map(m => m.pgs));
  const escolha = medidas.find(m => m.pgs === minimo);   // CORPOS vem do maior
  const corpo = escolha.fs;
  doc.corpoUsado = corpo;
  doc.paginasPorAluno = escolha.pgs;

  alunos.forEach((aluno, idx) => {
    if(idx) doc.addPage();
    fluir(doc, cfg, aluno, corpo, false);
  });
  return doc;
}

if(typeof module !== "undefined") module.exports =
  {desenharCartao, gerarProvas, gabaritoIndividual, montarPayload, encurtarNome, prepararFontes, medirFigura};
