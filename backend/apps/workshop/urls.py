from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("service-types", views.ServiceTypeViewSet, basename="service-type")
router.register("mechanics", views.MechanicViewSet, basename="mechanic")

urlpatterns = router.urls
