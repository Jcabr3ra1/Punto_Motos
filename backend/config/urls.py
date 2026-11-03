from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.catalog.urls")),
    path("api/v1/", include("apps.inventory.urls")),
    path("api/v1/", include("apps.purchases.urls")),
    path("api/v1/", include("apps.sales.urls")),
    path("api/v1/", include("apps.consignments.urls")),
    path("api/v1/", include("apps.cash.urls")),
]

# Rutas inexistentes y fallos inesperados también responden con el formato de error de la API.
handler404 = "apps.core.views.not_found"
handler500 = "apps.core.views.server_error"
