from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("service-types", views.ServiceTypeViewSet, basename="service-type")
router.register("mechanics", views.MechanicViewSet, basename="mechanic")

urlpatterns = [
    path("mechanic-settlements/daily", views.DailySettlementView.as_view(), name="mechanic-settlements-daily"),
    path("mechanic-settlements", views.SettlementListView.as_view(), name="mechanic-settlements"),
    path("mechanic-settlements/<int:pk>", views.SettlementDetailView.as_view(), name="mechanic-settlement-detail"),
    path("mechanic-deductions", views.DeductionListView.as_view(), name="mechanic-deductions"),
    *router.urls,
]
