from django.urls import path

from . import views

urlpatterns = [
    path("health", views.HealthView.as_view(), name="health"),
    path("settings/business", views.BusinessSettingsView.as_view(), name="business-settings"),
]
