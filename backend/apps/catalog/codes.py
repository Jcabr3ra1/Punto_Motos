"""Sugerencia del código interno de un producto.

Formatos del informe (sección 2.1):

- Repuesto: sigla del tipo, sigla de la moto y tres letras del nombre: FRE-PUL-PAS.
- Repuesto universal: la moto es UNI: ELE-UNI-BUJ.
- Llanta: LL seguido de la medida sin barras y el rin: LL909018.
- Si el código ya existe, se agrega un número al final: FRE-PUL-PAS2.
"""
import re

from .models import UNIVERSAL_ABBREVIATION, Product, normalize_code
from .text import plain_text

TIRE_ABBREVIATION = "LL"

# Palabras que no sirven para identificar el producto.
STOPWORDS = {"DE", "DEL", "LA", "EL", "LOS", "LAS", "PARA", "CON", "Y", "EN", "X"}


def suggest_code(category, name, moto=None, exclude_pk=None):
    """Devuelve un código libre para el producto, o "" si faltan datos para armarlo."""
    if category is None or not name.strip():
        return ""
    if category.abbreviation == TIRE_ABBREVIATION:
        base = _tire_code(name)
    else:
        keyword = _keyword(name)
        if not keyword:
            return ""
        moto_part = moto.abbreviation if moto else UNIVERSAL_ABBREVIATION
        base = f"{category.abbreviation}-{moto_part}-{keyword}"
    return _first_free(base, exclude_pk) if base else ""


def _keyword(name):
    """Tres primeras letras de la primera palabra útil: «Pastillas de freno» -> PAS."""
    for word in _plain(name).split():
        letters = re.sub(r"[^A-Z]", "", word)
        if len(letters) >= 3 and letters not in STOPWORDS:
            return letters[:3]
    return ""


def _tire_code(name):
    """«Llanta 90/90 rin 18» -> LL909018."""
    digits = "".join(re.findall(r"\d+", name))
    return f"{TIRE_ABBREVIATION}{digits}" if digits else ""


def _plain(text):
    """Mayúsculas sin tildes: «Bujía» -> BUJIA."""
    return plain_text(text).upper()


def _first_free(base, exclude_pk):
    taken = Product.objects.filter(code_normalized__startswith=normalize_code(base))
    if exclude_pk:
        taken = taken.exclude(pk=exclude_pk)
    taken = set(taken.values_list("code_normalized", flat=True))
    candidate, number = base, 2
    while normalize_code(candidate) in taken:
        candidate = f"{base}{number}"
        number += 1
    return candidate
