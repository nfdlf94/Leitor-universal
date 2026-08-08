# -*- coding: utf-8 -*-
"""
layout.py — Geometria paramétrica do cartão-resposta
Desbugando a Matemática | correção automática por câmera

ESTE ARQUIVO TEM UM ESPELHO EXATO: layout.js
Qualquer mudança aqui exige a mesma mudança lá, senão o scanner procura
bolha onde a impressora não desenhou.

A ideia central: o cartão deixa de ser fixo em 10 questões. Dadas
  nq  = número de questões  (5 a 30)
  no  = número de alternativas por questão (4 ou 5)
o motor devolve toda a geometria, em milímetros, no sistema de coordenadas
do cartão — origem no CENTRO do fiducial superior-esquerdo, x para a
direita, y para BAIXO.

Regras de composição (fixas, para a leitura continuar confiável):
  · passo vertical entre linhas ............ 9,0 mm
  · passo horizontal entre alternativas .... 9,0 mm
  · raio da bolha .......................... 2,6 mm
  · fiducial ............................... quadrado sólido de 10 mm
  · QR ..................................... 30 mm, sempre à esquerda
  · zona de silêncio ....................... 7 mm além dos fiduciais
"""

from math import ceil

VERSION = 2

# --- constantes de composição ---------------------------------------------
PASSO_Y = 9.0          # entre linhas de questão
PASSO_X = 9.0          # entre alternativas
RAIO = 2.6             # raio da bolha
FID = 10.0             # lado do fiducial
QUIET = 7.0            # zona de silêncio
QR_X, QR_Y, QR_S = 4.0, 11.0, 30.0

Y0 = 12.0              # centro da primeira linha
LABEL_X0 = 46.0        # coluna do número da questão (1ª coluna)
LABEL_GAP = 10.0       # do número até a bolha A
MARGEM_DIR = 14.0      # da última bolha até o fiducial direito
FOLGA_COL = 22.0       # LABEL_GAP + 2*RAIO + respiro entre colunas

LETRAS = ["A", "B", "C", "D", "E"]

MIN_Q, MAX_Q = 5, 30
MIN_O, MAX_O = 4, 5


def colunas_de(nq):
    """Quantas colunas de questões. Até 6 questões cabe em uma só."""
    return 1 if nq <= 6 else 2


def montar(nq, no):
    """Devolve o dicionário de geometria em mm."""
    nq, no = int(nq), int(no)
    if not (MIN_Q <= nq <= MAX_Q):
        raise ValueError("nq deve estar entre %d e %d" % (MIN_Q, MAX_Q))
    if not (MIN_O <= no <= MAX_O):
        raise ValueError("no deve ser 4 ou 5")

    ncols = colunas_de(nq)
    nlin = int(ceil(nq / float(ncols)))
    passo_col = (no - 1) * PASSO_X + FOLGA_COL

    box_w = (LABEL_X0 + (ncols - 1) * passo_col
             + LABEL_GAP + (no - 1) * PASSO_X + MARGEM_DIR)
    row_y = [Y0 + i * PASSO_Y for i in range(nlin)]
    # o cartão nunca é mais baixo que o QR exige
    box_h = max(row_y[-1] + 4.0, QR_Y + QR_S + 4.0)

    # distribuição das questões: coluna 1 recebe as primeiras nlin
    grupos = []
    n = 1
    for c in range(ncols):
        qs = []
        for _ in range(nlin):
            if n <= nq:
                qs.append(n)
                n += 1
        if qs:
            grupos.append({
                "label_x": LABEL_X0 + c * passo_col,
                "first_bubble_x": LABEL_X0 + c * passo_col + LABEL_GAP,
                "questions": qs,
            })

    return {
        "version": VERSION,
        "n_questions": nq,
        "n_options": no,
        "options": LETRAS[:no],
        "box_w": round(box_w, 3),
        "box_h": round(box_h, 3),
        "fid_size": FID,
        "quiet_zone": QUIET,
        "bubble_r": RAIO,
        "bubble_dx": PASSO_X,
        "row_y": row_y,
        "qr": {"x": QR_X, "y": QR_Y, "size": QR_S},
        "groups": grupos,
    }


def centros(L):
    """{questao: [(x,y) por alternativa]} em mm."""
    out = {}
    for g in L["groups"]:
        for i, q in enumerate(g["questions"]):
            y = L["row_y"][i]
            out[q] = [(g["first_bubble_x"] + k * L["bubble_dx"], y)
                      for k in range(L["n_options"])]
    return out


def normalizado(L):
    """Layout em 0..1 — é isto que o scanner consome."""
    W, H = L["box_w"], L["box_h"]
    bc = centros(L)
    q = L["qr"]
    return {
        "version": L["version"],
        "n_questions": L["n_questions"],
        "n_options": L["n_options"],
        "options": L["options"],
        "aspect": W / H,
        "bubble_r": L["bubble_r"] / W,
        "qr": {"x0": q["x"] / W, "y0": q["y"] / H,
               "x1": (q["x"] + q["size"]) / W, "y1": (q["y"] + q["size"]) / H},
        "bubbles": {str(k): [[x / W, y / H] for (x, y) in v]
                    for k, v in bc.items()},
    }


def assinatura(nq, no):
    """Marca curta que vai no QR: '10x5'."""
    return "%dx%d" % (int(nq), int(no))


if __name__ == "__main__":
    import json
    for nq, no in [(10, 5), (5, 4), (20, 5), (30, 5), (12, 4)]:
        L = montar(nq, no)
        print("%2dq x %d  ->  %6.1f x %6.1f mm   %d col   %d lin" % (
            nq, no, L["box_w"], L["box_h"], len(L["groups"]), len(L["row_y"])))
    print()
    print("compatibilidade com o cartão antigo (10x5):")
    L = montar(10, 5)
    ok = (L["box_w"] == 164.0 and L["box_h"] == 52.0
          and L["row_y"] == [12, 21, 30, 39, 48]
          and [g["first_bubble_x"] for g in L["groups"]] == [56.0, 114.0])
    print("  ", "IDÊNTICO" if ok else "DIVERGIU", L["box_w"], L["box_h"],
          L["row_y"], [g["first_bubble_x"] for g in L["groups"]])
