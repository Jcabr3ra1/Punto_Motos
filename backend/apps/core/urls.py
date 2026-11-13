from django.urls import path

from . import views

urlpatterns = [
    path("health", views.HealthView.as_view(), name="health"),
    path("settings/business", views.BusinessSettingsView.as_view(), name="business-settings"),
    path("backups/download", views.BackupDownloadView.as_view(), name="backup-download"),
    path("reports/monthly", views.MonthlyReportView.as_view(), name="monthly-report"),
    path("notifications", views.NotificationsView.as_view(), name="notifications"),
]
