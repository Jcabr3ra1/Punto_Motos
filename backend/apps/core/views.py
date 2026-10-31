from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BusinessSettings
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

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return Response({
            "status": "ok",
            "version": settings.APP_VERSION,
            "server_time": timezone.localtime().isoformat(),
        })


class BusinessSettingsView(APIView):
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
