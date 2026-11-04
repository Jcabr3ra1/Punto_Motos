from django.urls import path

from . import views

urlpatterns = [
    path("inventory/movements", views.MovementListView.as_view(), name="inventory-movements"),
    path("inventory/adjustments", views.AdjustmentView.as_view(), name="inventory-adjustments"),
    path("inventory/workshop-use", views.WorkshopUseView.as_view(), name="inventory-workshop-use"),
    path("inventory/initial-count", views.InitialCountView.as_view(), name="inventory-initial-count"),
    path("inventory/initial-count/items", views.InitialCountItemView.as_view(), name="inventory-initial-count-items"),
    path("inventory/initial-count/finish", views.FinishInitialCountView.as_view(), name="inventory-initial-count-finish"),
]
