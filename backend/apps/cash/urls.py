from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("cash-sessions", views.CashSessionViewSet, basename="cash-session")
router.register("cash-movements", views.CashMovementViewSet, basename="cash-movement")

urlpatterns = router.urls
