from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("consignees", views.ConsigneeViewSet, basename="consignee")
router.register("consignment-deliveries", views.ConsignmentDeliveryViewSet, basename="consignment-delivery")
router.register("consignment-reports", views.ConsignmentReportViewSet, basename="consignment-report")
router.register("consignee-payments", views.ConsigneePaymentViewSet, basename="consignee-payment")

urlpatterns = router.urls
