from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("customers", views.CustomerViewSet, basename="customer")
router.register("sales", views.SaleViewSet, basename="sale")

urlpatterns = router.urls
