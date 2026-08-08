/* Espelho exato de embaralho.py — permite ao app desembaralhar qualquer
   cartão usando só turma e número, que já estão no QR. */
function semente(turma, numero){
  let h = 2166136261 >>> 0;
  const s = String(turma) + "|" + String(numero);
  for (let i = 0; i < s.length; i++){
    h = (h ^ (s.charCodeAt(i) & 0xFF)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function lcg(s){
  let e = s >>> 0;
  return () => { e = (Math.imul(e, 1664525) + 1013904223) >>> 0; return e / 4294967296; };
}
function permutacao(n, s){
  const r = lcg(s), p = Array.from({length:n}, (_, i) => i);
  for (let i = n - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}
function embaralharProva(nq, na, turma, numero){
  const s = semente(turma, numero);
  const oq = permutacao(nq, s), oa = [];
  for (let p = 0; p < nq; p++)
    oa.push(permutacao(na, (Math.imul(0x9E3779B9, p + 1) + s) >>> 0));
  return {oq, oa};
}
/* posição p do cartão -> índice do item canônico */
const itemCanonico = (oq, p) => oq[p];
/* letra marcada na posição p -> letra canônica daquele item */
function letraCanonica(oa, p, letra, opcoes){
  const k = opcoes.indexOf(letra);
  return k < 0 ? null : opcoes[oa[p][k]];
}
if (typeof module !== "undefined") module.exports = {semente, permutacao, embaralharProva, itemCanonico, letraCanonica};
