from django.conf import settings
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOwner, IsOwnerOrReadOnly

from .backups import create_verified_backup_bytes
from .models import BusinessSettings
from .monthly_report import build_monthly_report
from .notifications import build_notifications
from .serializers import BusinessSettingsSerializer


def not_found(request, exception=None):
    return JsonResponse(
        {"code": "not_found", "message": "No se encontró el registro solicitado.", "fields": {}}, status=404
    )


def server_error(request):
    return JsonResponse(
        {"code": "server_error", "message": "Ocurrió un error inesperado en el programa.", "fields": {}}, status=500
    )


class HealthView(APIView):
    """Tauri consulta este endpoint para saber cuándo mostrar las pantallas."""

    permission_classes = [AllowAny]

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return Response({
            "status": "ok",
            "version": settings.APP_VERSION,
            "server_time": timezone.localtime().isoformat(),
        })


class BusinessSettingsView(APIView):
    permission_classes = [IsOwnerOrReadOnly]

    def get(self, request):
        return Response(BusinessSettingsSerializer(BusinessSettings.load()).data)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial):
        serializer = BusinessSettingsSerializer(BusinessSettings.load(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class BackupDownloadView(APIView):
    """Genera y descarga una copia SQLite verificada del negocio (solo dueño)."""

    permission_classes = [IsOwner]

    def get(self, request):
        data, sha256 = create_verified_backup_bytes()
        now = timezone.now()
        settings_obj = BusinessSettings.load()
        settings_obj.last_backup_at = now
        settings_obj.save(update_fields=["last_backup_at"])
        today = timezone.localdate(now).isoformat()
        response = HttpResponse(data, content_type="application/x-sqlite3")
        response["Content-Disposition"] = f'attachment; filename="punto-moto-respaldo-{today}.sqlite3"'
        response["X-Backup-Sha256"] = sha256
        return response


class MonthlyReportView(APIView):
    """Recuento mensual consolidado del negocio para descarga o consulta (solo dueño)."""

    permission_classes = [IsOwner]

    def get(self, request):
        return Response(build_monthly_report(request.query_params.get("month")))


class NotificationsView(APIView):
    """Alertas rápidas y existencias por reponer para la barra superior."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_notifications(request.user))
