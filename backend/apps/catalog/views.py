from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOwner, IsOwnerOrReadOnly
from apps.core.pagination import StandardPagination

from .models import Brand, Category, MotoModel, Product, normalize_code
from .serializers import (
    BrandSerializer,
    CategorySerializer,
    CodeSuggestionSerializer,
    MotoModelSerializer,
    ProductSerializer,
    ProductWriteSerializer,
)
from .text import plain_text

SEARCH_MIN_LENGTH = 2
SEARCH_LIMIT = 8


def _flag(request, name):
    return request.query_params.get(name, "").lower() in ("1", "true", "si", "sí")


def _id_param(request, name):
    """Lee un id de la URL; un valor que no sea número responde 400 en lugar de fallar."""
    value = request.query_params.get(name)
    if not value:
        return None
    if not value.isdigit():
        raise ValidationError({name: ["Debe ser un número."]})
    return int(value)


class CatalogViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Base del catálogo: todos consultan, solo el dueño crea y edita.

    No hay DELETE: lo que ya se usó en documentos se desactiva con is_active = false.
    Los listados muestran solo lo activo, salvo ?include_inactive=true.
    """

    permission_classes = [IsOwnerOrReadOnly]
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list" and not _flag(self.request, "include_inactive"):
            queryset = queryset.filter(is_active=True)
        return queryset


class CategoryViewSet(CatalogViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class BrandViewSet(CatalogViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer


class MotoModelViewSet(CatalogViewSet):
    queryset = MotoModel.objects.all()
    serializer_class = MotoModelSerializer


class ProductViewSet(CatalogViewSet):
    """Listado paginado con filtros: ?q=, ?category=, ?moto=, ?workshop_supply=true, ?ordering=."""

    queryset = Product.objects.select_related("category", "brand", "moto").prefetch_related("compatible_motos")
    pagination_class = StandardPagination
    ORDERING = {"name", "-name", "code", "-code", "updated_at", "-updated_at", "sale_price", "-sale_price"}

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductWriteSerializer
        return ProductSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action != "list":
            return queryset
        params = self.request.query_params
        if params.get("q"):
            queryset = queryset.filter(_text_filter(params["q"])).distinct()
        category = _id_param(self.request, "category")
        if category:
            queryset = queryset.filter(category_id=category)
        moto = _id_param(self.request, "moto")
        if moto:
            queryset = queryset.filter(Q(moto_id=moto) | Q(compatible_motos=moto)).distinct()
        if _flag(self.request, "workshop_supply"):
            queryset = queryset.filter(is_workshop_supply=True)
        ordering = params.get("ordering", "name")
        return queryset.order_by(ordering if ordering in self.ORDERING else "name")


class ProductSearchView(APIView):
    """Buscador de la pantalla de venta.

    Desde dos caracteres devuelve hasta ocho productos activos, en este orden:
    1. el código exacto (con o sin guiones),
    2. los códigos que empiezan por lo escrito,
    3. los productos cuyo nombre, marca o motos contienen todas las palabras, sin tildes.
    """

    def get(self, request):
        text = request.query_params.get("q", "").strip()
        if len(text) < SEARCH_MIN_LENGTH:
            return Response([])

        active = Product.objects.filter(is_active=True).select_related("category", "brand", "moto")
        active = active.prefetch_related("compatible_motos")
        code = normalize_code(text)

        found = []
        for queryset in (
            active.filter(code_normalized=code),
            active.filter(code_normalized__startswith=code).order_by("code_normalized"),
            active.filter(_text_filter(text)).distinct().order_by("name"),
        ):
            for product in queryset[:SEARCH_LIMIT]:
                if product not in found:
                    found.append(product)
            if len(found) >= SEARCH_LIMIT:
                break

        serializer = ProductSerializer(found[:SEARCH_LIMIT], many=True, context={"request": request})
        return Response(serializer.data)


class CodeSuggestionView(APIView):
    """El formulario de producto pide una sugerencia de código mientras el dueño escribe."""

    permission_classes = [IsOwner]

    def get(self, request):
        serializer = CodeSuggestionSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response({"code": serializer.suggestion()})


def _text_filter(text):
    """Cada palabra debe aparecer en el nombre, la marca, la moto principal o una compatible.

    Se compara sin tildes ni mayúsculas: «bujia» encuentra «Bujía».
    """
    condition = Q()
    for word in plain_text(text).split():
        condition &= (
            Q(search_text__contains=word)
            | Q(brand__search_name__contains=word)
            | Q(moto__search_name__contains=word)
            | Q(compatible_motos__search_name__contains=word)
        )
    return condition
