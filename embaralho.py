# -*- coding: utf-8 -*-
"""
embaralho.py — embaralhamento determinístico de questões e alternativas
Desbugando a Matemática

ESPELHO EXATO de embaralho.js. A mesma dupla (turma, número) produz sempre
a mesma prova, e é só disso que o app precisa para desembaralhar o cartão.

Usa FNV-1a de 32 bits para a semente e um LCG (numerical recipes) para o
sorteio, ambos em aritmética de 32 bits sem sinal — exatamente como o
JavaScript faz com Math.imul e >>> 0.
"""

M32 = 0xFFFFFFFF
LETRAS = ["A", "B", "C", "D", "E"]


def semente(turma, numero):
    h = 2166136261
    s = "%s|%s" % (turma, numero)
    for ch in s:
        h = (h ^ (ord(ch) & 0xFF)) & M32
        h = (h * 16777619) & M32
    return h


def _lcg(s):
    estado = [s & M32]

    def prox():
        estado[0] = (estado[0] * 1664525 + 1013904223) & M32
        return estado[0] / 4294967296.0
    return prox


def permutacao(n, s):
    r = _lcg(s)
    p = list(range(n))
    for i in range(n - 1, 0, -1):
        j = int(r() * (i + 1))
        p[i], p[j] = p[j], p[i]
    return p


def embaralhar_prova(nq, na, turma, numero):
    """Devolve (oq, oa):
       oq[p] = índice do item canônico que ocupa a posição p do cartão
       oa[p][k] = índice da alternativa canônica na k-ésima posição impressa"""
    s = semente(turma, numero)
    oq = permutacao(nq, s)
    oa = [permutacao(na, ((0x9E3779B9 * (p + 1)) + s) & M32) for p in range(nq)]
    return oq, oa


def gabarito_individual(gab_canonico, turma, numero, n_opcoes=5):
    """Converte o gabarito canônico da prova no gabarito impresso para
    ESTE aluno. É o que vai dentro do QR do cartão."""
    gab = str(gab_canonico).strip().upper()
    nq = len(gab)
    letras = LETRAS[:n_opcoes]
    oq, oa = embaralhar_prova(nq, n_opcoes, turma, numero)
    saida = []
    for p in range(nq):
        certa = letras.index(gab[oq[p]])       # alternativa correta do item
        saida.append(letras[oa[p].index(certa)])  # onde ela foi parar
    return "".join(saida)


def ordem_para_aluno(nq, n_opcoes, turma, numero):
    """Conveniência para o gerador do PDF montar a folha de questões."""
    oq, oa = embaralhar_prova(nq, n_opcoes, turma, numero)
    return {"ordem_questoes": oq, "ordem_alternativas": oa}


if __name__ == "__main__":
    print(gabarito_individual("BDDACDCCDC", "3A", "07"))
