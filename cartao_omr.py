# -*- coding: utf-8 -*-
"""
cartao_omr.py — Cartão-resposta com QR + marcadores fiduciais  (v2)
Desbugando a Matemática | leitura automática por câmera

Agora paramétrico: 5 a 30 questões, 4 ou 5 alternativas.
A geometria vem toda de layout.py — este módulo só desenha.

Compatibilidade: para 10 questões x 5 alternativas o cartão sai
milimetricamente igual ao da versão 1, então provas já impressas
continuam válidas.
"""

from reportlab.lib.units import mm
from reportlab.lib.colors import Color, black, white
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

import layout as LY
import embaralho as EM

# --- identidade visual ------------------------------------------------------
NAVY = Color(0.055, 0.129, 0.239)      # #0E2145
ORANGE = Color(0.976, 0.451, 0.086)    # #F97316
GREY = Color(0.62, 0.65, 0.70)
ZEBRA = Color(0.96, 0.965, 0.975)

NOME_MAX = 30          # menor que antes: o payload agora carrega o layout


def encurtar_nome(nome, limite=NOME_MAX):
    """Abrevia nomes do meio até caber no QR, preservando primeiro e último.
    'MATHEUS EDUARDO BELO DOS SANTOS LAUREANO' -> 'MATHEUS E. B. D. S. LAUREANO'
    O nome impresso no cabeçalho continua completo."""
    p = " ".join(str(nome).split()).upper().split()
    if not p:
        return ""
    nm = " ".join(p)
    i = 1
    while len(nm) > limite and i < len(p) - 1:
        p[i] = p[i][0] + "."
        nm = " ".join(p)
        i += 1
    return nm[:limite]


def montar_payload(id_prova, gabarito_individual, turma="", numero="",
                   nome="", n_opcoes=5):
    """
    DBM4|<id>|<gabarito do ALUNO>|<turma>|<numero>|<nome>|<nqxno>

    ATENÇÃO: o gabarito que vai no QR é o INDIVIDUAL (já embaralhado para
    este aluno), porque é contra ele que o scanner compara as bolhas.
    Use desenhar_cartao(), que faz essa conversão sozinho a partir do
    gabarito canônico — não monte o payload à mão.

    A assinatura do layout no fim é o que permite ao scanner se
    reconfigurar sozinho ao ler um cartão de prova desconhecida.
    As habilidades continuam fora do QR: são iguais para a turma
    inteira e engordariam o código a ponto de atrapalhar a leitura.
    """
    gab = str(gabarito_individual).strip().upper()
    letras = LY.LETRAS[:n_opcoes]
    if not LY.MIN_Q <= len(gab) <= LY.MAX_Q:
        raise ValueError("gabarito deve ter de %d a %d letras" % (LY.MIN_Q, LY.MAX_Q))
    if any(c not in letras for c in gab):
        raise ValueError("use apenas %s–%s" % (letras[0], letras[-1]))
    nm = encurtar_nome(nome)
    if "|" in nm:
        raise ValueError("o nome não pode conter |")
    return "|".join(["DBM4", str(id_prova).strip(), gab, str(turma).strip(),
                     str(numero).strip(), nm, LY.assinatura(len(gab), n_opcoes)])


def altura_cartao(nq, no=5):
    """Altura total ocupada em mm, incluindo zona de silêncio. Útil para
    o gerador da prova decidir quanto espaço reservar na página."""
    L = LY.montar(nq, no)
    return L["box_h"] + 2 * L["quiet_zone"]


def largura_cartao(nq, no=5):
    L = LY.montar(nq, no)
    return L["box_w"] + 2 * L["quiet_zone"]


def desenhar_cartao(c, x_mm, y_mm, id_prova, gabarito_canonico,
                    turma="", numero="", nome="", n_opcoes=5,
                    mostrar_moldura=True):
    """
    Desenha o cartão no canvas `c`.

    `gabarito_canonico` é o gabarito da prova na ORDEM ORIGINAL. O
    embaralhamento para este aluno é aplicado aqui dentro, de modo que
    quem chama nunca precisa pensar nisso — e não há como trocar um
    pelo outro por engano.
    (x_mm, y_mm) = canto SUPERIOR-ESQUERDO do fiducial superior-esquerdo,
    medido a partir do canto inferior-esquerdo da página (padrão ReportLab).
    Retorna a altura total ocupada, em mm.
    """
    gabC = str(gabarito_canonico).strip().upper()
    nq = len(gabC)
    gab = EM.gabarito_individual(gabC, turma, numero, n_opcoes)
    L = LY.montar(nq, n_opcoes)
    W, H = L["box_w"], L["box_h"]
    fid, qz, r = L["fid_size"], L["quiet_zone"], L["bubble_r"]
    opcoes = L["options"]

    ox = (x_mm + fid / 2.0) * mm
    oy = (y_mm - fid / 2.0) * mm

    def P(mx, my):
        return (ox + mx * mm, oy - my * mm)

    c.saveState()

    # zona de silêncio: fundo branco garantido em volta dos fiduciais
    c.setFillColor(white)
    c.setStrokeColor(white)
    c.rect(ox - qz * mm, oy - (H + qz) * mm,
           (W + 2 * qz) * mm, (H + 2 * qz) * mm, stroke=0, fill=1)

    if mostrar_moldura:
        c.setStrokeColor(GREY)
        c.setLineWidth(0.5)
        c.setDash(3, 3)
        c.rect(ox - (qz - 1.5) * mm, oy - (H + qz - 1.5) * mm,
               (W + 2 * (qz - 1.5)) * mm, (H + 2 * (qz - 1.5)) * mm,
               stroke=1, fill=0)
        c.setDash()

    # quatro marcadores fiduciais
    c.setFillColor(black)
    for (mx, my) in [(0, 0), (W, 0), (W, H), (0, H)]:
        px, py = P(mx, my)
        c.rect(px - fid / 2 * mm, py - fid / 2 * mm,
               fid * mm, fid * mm, stroke=0, fill=1)

    # QR
    payload = montar_payload(id_prova, gab, turma, numero, nome, n_opcoes)
    q = L["qr"]
    widget = qr.QrCodeWidget(payload, barLevel="M")
    bx1, by1, bx2, by2 = widget.getBounds()
    esc = (q["size"] * mm) / max(bx2 - bx1, by2 - by1)
    d = Drawing(q["size"] * mm, q["size"] * mm,
                transform=[esc, 0, 0, esc, -bx1 * esc, -by1 * esc])
    d.add(widget)
    qx, qy = P(q["x"], q["y"] + q["size"])
    renderPDF.draw(d, c, qx, qy)

    # rótulos
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 7)
    px, py = P(q["x"] + 2.0, 7.5)
    c.drawString(px, py, "CARTÃO-RESPOSTA")

    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 6.5)
    px, py = P(q["x"] + 2.0, q["y"] + q["size"] + 5.5)
    c.drawString(px, py, ("%s  %s" % (turma, numero)).strip()
                 or str(id_prova).upper()[:16])

    c.setFillColor(GREY)
    c.setFont("Helvetica", 5.5)
    px, py = P(q["x"] + 2.0, q["y"] + q["size"] + 10.5)
    c.drawString(px, py, "%d questões · %s a %s" % (nq, opcoes[0], opcoes[-1]))

    # grade de bolhas
    largura_faixa = (L["bubble_dx"] * (L["n_options"] - 1) + 2 * r + 15) * mm
    for g in L["groups"]:
        c.setFillColor(GREY)
        c.setFont("Helvetica-Bold", 6)
        for k, letra in enumerate(opcoes):
            mx = g["first_bubble_x"] + k * L["bubble_dx"]
            px, py = P(mx, L["row_y"][0] - r - 2.2)
            c.drawCentredString(px, py, letra)

        for i, qn in enumerate(g["questions"]):
            y = L["row_y"][i]
            if i % 2 == 1:
                c.setFillColor(ZEBRA)
                fx, fy = P(g["label_x"] - 6.0, y + r + 1.6)
                c.rect(fx, fy, largura_faixa, (2 * r + 3.2) * mm,
                       stroke=0, fill=1)

            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 8)
            px, py = P(g["label_x"], y + 1.3)
            c.drawCentredString(px, py, "%02d" % qn)

            c.setStrokeColor(NAVY)
            c.setLineWidth(0.7)
            c.setFillColor(white)
            for k in range(L["n_options"]):
                px, py = P(g["first_bubble_x"] + k * L["bubble_dx"], y)
                c.circle(px, py, r * mm, stroke=1, fill=1)

    c.restoreState()
    return H + 2 * qz
