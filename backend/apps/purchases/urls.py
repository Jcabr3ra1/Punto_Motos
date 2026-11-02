from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("suppliers", views.SupplierViewSet, basename="supplier")
router.register("purchases", views.PurchaseViewSet, basename="purchase")
router.register("supplier-payments", views.SupplierPaymentViewSet, basename="supplier-payment")

urlpatterns = router.urls
