from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("catalog/categories", views.CategoryViewSet, basename="category")
router.register("catalog/brands", views.BrandViewSet, basename="brand")
router.register("catalog/motos", views.MotoModelViewSet, basename="moto")
router.register("products", views.ProductViewSet, basename="product")

urlpatterns = [
    path("catalog/search", views.ProductSearchView.as_view(), name="catalog-search"),
    path("catalog/code-suggestion", views.CodeSuggestionView.as_view(), name="catalog-code-suggestion"),
    *router.urls,
]
