import unicodedata


def plain_text(value):
    """Texto para buscar: minúsculas, sin tildes y con espacios simples.

    «Bujía  NGK» -> «bujia ngk». La ñ también pasa a n: «Piñón» -> «pinon».
    """
    decomposed = unicodedata.normalize("NFKD", value.lower())
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(without_accents.split())
