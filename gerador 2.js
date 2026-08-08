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
const MARG = 16, TOPO = 14, MARGEM_CARTAO = 6;

function cabecalho(doc, cfg, aluno, larguraUtil){
  doc.setFillColor(...COR.navy);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 25, "F");
  doc.setTextColor(...COR.branco); doc.setFont(FONTE_TEXTO,"bold"); doc.setFontSize(12);
  doc.text(cfg.escola || "DESBUGANDO A MATEMÁTICA", MARG, 10);
  doc.setTextColor(...COR.orange); doc.setFontSize(7.5);
  doc.text([cfg.titulo || cfg.codigo, cfg.turma, cfg.disciplina]
             .filter(Boolean).join("  •  ").toUpperCase(), MARG, 16.5);
  doc.setTextColor(...COR.branco); doc.setFont(FONTE_TEXTO,"normal"); doc.setFontSize(8.5);
  doc.text("Nº " + aluno.numero + "  ·  " + aluno.nome, MARG, 22);
  return 25 + 8;
}

/* figura: largura máxima 78 mm, altura máxima 58 mm, proporção preservada */
const FIG_MAX_W = 78, FIG_MAX_H = 58;
function medirFigura(img){
  if(!img || !img.dados) return null;
  const pw = img.w || 400, ph = img.h || 300;
  let w = Math.min(FIG_MAX_W, pw * 0.2646);      // px -> mm a ~96 dpi
  let h = w * ph / pw;
  if(h > FIG_MAX_H){ h = FIG_MAX_H; w = h * pw / ph; }
  return {w, h};
}

function desenharQuestao(doc, y, n, item, larguraUtil, opcoes){
  const alturaLinha = 4.6;
  doc.setTextColor(...COR.navy); doc.setFont(FONTE_TEXTO,"bold"); doc.setFontSize(9.5);
  doc.text(String(n).padStart(2,"0") + ".", MARG, y);
  doc.setFont(FONTE_TEXTO,"normal"); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const linhas = doc.splitTextToSize(String(item.enunciado||""), larguraUtil - 9);
  doc.text(linhas, MARG + 9, y);
  y += linhas.length * alturaLinha + 1.5;
  const fig = medirFigura(item.imagem);
  if(fig){
    try{ doc.addImage(item.imagem.dados, "JPEG", MARG + 11, y, fig.w, fig.h);
         y += fig.h + 3; }
    catch(e){ console.warn("figura da questão " + n + " não pôde ser inserida", e);
      doc.setFontSize(8); doc.setTextColor(200,80,60);
      doc.text("[figura não inserida]", MARG + 11, y); y += 6; }
  }
  (item.alternativas||[]).forEach((alt, k) => {
    doc.setFont(FONTE_TEXTO,"bold"); doc.setTextColor(...COR.orange); doc.setFontSize(9);
    doc.text(opcoes[k] + ")", MARG + 11, y);
    doc.setFont(FONTE_TEXTO,"normal"); doc.setTextColor(30,30,30);
    const la = doc.splitTextToSize(String(alt), larguraUtil - 22);
    doc.text(la, MARG + 18, y);
    y += la.length * alturaLinha + 0.6;
  });
  return y + 4;
}

/* altura aproximada, para decidir quebra de página sem desenhar */
function alturaQuestao(doc, item, larguraUtil){
  doc.setFont(FONTE_TEXTO,"normal"); doc.setFontSize(9.5);
  let h = doc.splitTextToSize(String(item.enunciado||""), larguraUtil - 9).length * 4.6 + 1.5;
  const fig = medirFigura(item.imagem);
  if(fig) h += fig.h + 3;
  (item.alternativas||[]).forEach(a => {
    h += doc.splitTextToSize(String(a), larguraUtil - 22).length * 4.6 + 0.6; });
  return h + 4;
}

/**
 * cfg = {codigo, titulo, escola, turma, disciplina, gabaritoCanonico, no,
 *        questoes:[{enunciado, alternativas:[...]}]}
 * alunos = [{numero, nome}]
 * Devolve o objeto jsPDF pronto para salvar.
 */
function gerarProvas(cfg, alunos, jsPDFctor){
  const Ctor = jsPDFctor || (window.jspdf && window.jspdf.jsPDF);
  const doc = new Ctor({unit:"mm", format:"a4", compress:true});
  prepararFontes(doc);

  // conferência prévia: um caractere fora da fonte apaga o resto da linha,
  // e isso só apareceria depois de 40 provas impressas
  if(typeof caracteresFaltando === "function"){
    const textos = [cfg.titulo, cfg.escola, cfg.disciplina];
    (cfg.questoes||[]).forEach(q=>{ textos.push(q.enunciado);
      (q.alternativas||[]).forEach(a=>textos.push(a)); });
    alunos.forEach(a=>textos.push(a.nome));
    const fora = caracteresFaltando(textos);
    if(fora.length) doc.avisoCaracteres = fora;
  }
  const larguraPag = doc.internal.pageSize.getWidth();
  const alturaPag  = doc.internal.pageSize.getHeight();
  const larguraUtil = larguraPag - 2*MARG;
  const gabC = String(cfg.gabaritoCanonico).toUpperCase();
  const nq = gabC.length, no = cfg.no || 5;
  const opcoes = ["A","B","C","D","E"].slice(0, no);
  const alturaCartao = montarLayout(nq, no).box_h + 2*montarLayout(nq, no).quiet_zone;

  alunos.forEach((aluno, idx) => {
    if(idx) doc.addPage();
    const {oq, oa} = embaralharProva(nq, no, cfg.turma, aluno.numero);
    let y = cabecalho(doc, cfg, aluno, larguraUtil);

    for(let p = 0; p < nq; p++){
      const base = (cfg.questoes||[])[oq[p]] || {enunciado:"(questão "+(oq[p]+1)+")", alternativas:[]};
      // a posição k impressa recebe a alternativa canônica oa[p][k] —
      // é exatamente a convenção que letraCanonica() desfaz na correção
      const item = {enunciado: base.enunciado, imagem: base.imagem,
        alternativas: oa[p].map(ci => (base.alternativas||[])[ci])};
      const h = alturaQuestao(doc, item, larguraUtil);
      if(y + h > alturaPag - MARG){ doc.addPage(); y = TOPO; }
      y = desenharQuestao(doc, y, p+1, item, larguraUtil, opcoes);
    }

    // parte II: discursivas, fora do cartão e sem embaralhamento
    const disc = cfg.discursivas || [];
    if(disc.length){
      if(y + 40 > alturaPag - MARG){ doc.addPage(); y = TOPO; }
      doc.setFillColor(...COR.navy);
      doc.rect(MARG, y - 4, larguraUtil, 7, "F");
      doc.setTextColor(...COR.branco); doc.setFont(FONTE_TEXTO,"bold"); doc.setFontSize(8);
      doc.text("PARTE II — QUESTÕES DISCURSIVAS  (responda no espaço indicado)", MARG + 2, y + 0.8);
      y += 10;
      disc.forEach((q, i) => {
        const linhas = doc.splitTextToSize(String(q.enunciado||""), larguraUtil - 9);
        const fig = medirFigura(q.imagem);
        const espaco = Math.max(18, q.linhas ? q.linhas * 7 : 28);
        const alturaTotal = linhas.length * 4.6 + (fig ? fig.h + 3 : 0) + espaco + 10;
        if(y + alturaTotal > alturaPag - MARG){ doc.addPage(); y = TOPO; }
        doc.setTextColor(...COR.navy); doc.setFont(FONTE_TEXTO,"bold"); doc.setFontSize(9.5);
        doc.text(String(i+1) + ".", MARG, y);
        doc.setTextColor(...COR.grey); doc.setFont(FONTE_TEXTO,"normal"); doc.setFontSize(7);
        doc.text("(" + (q.pontos!=null?q.pontos:"") + " pt)", MARG, y + 4.2);
        doc.setFont(FONTE_TEXTO,"normal"); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
        doc.text(linhas, MARG + 9, y);
        y += linhas.length * 4.6 + 2;
        if(fig){ try{ doc.addImage(q.imagem.dados, "JPEG", MARG + 9, y, fig.w, fig.h);
                      y += fig.h + 3; }catch(e){} }
        doc.setDrawColor(210, 214, 220); doc.setLineWidth(0.3);
        for(let l = 0; l < Math.round(espaco / 7); l++){
          const yy = y + 5 + l * 7;
          doc.line(MARG + 9, yy, MARG + larguraUtil - 2, yy);
        }
        y += espaco + 8;
      });
    }

    // cartão sempre no rodapé de uma página, com espaço garantido
    // a folga da checagem tem que ser a MESMA do desenho, senão o cartão
    // vai para uma página nova por causa de milímetros que existiam
    if(y + alturaCartao > alturaPag - MARGEM_CARTAO){ doc.addPage(); y = TOPO; }
    desenharCartao(doc, {x: MARG, y: alturaPag - alturaCartao - MARGEM_CARTAO,
      codigo: cfg.codigo, gabaritoCanonico: gabC, no,
      turma: cfg.turma, numero: aluno.numero, nome: aluno.nome});
  });
  return doc;
}

if(typeof module !== "undefined") module.exports =
  {desenharCartao, gerarProvas, gabaritoIndividual, montarPayload, encurtarNome, prepararFontes, medirFigura};
