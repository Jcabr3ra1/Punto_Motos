from django.contrib.auth.models import update_last_login
from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Role, User
from .permissions import IsOwner
from .serializers import (
    LoginSerializer,
    SetPasswordSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


# --- Configuración inicial -------------------------------------------------


class SetupStatusView(APIView):
    """El asistente de instalación pregunta si falta crear el dueño."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"needs_owner": not User.objects.exists()})


class SetupOwnerView(APIView):
    """Crea el primer usuario, que siempre es el dueño. Solo funciona una vez."""

    permission_classes = [AllowAny]

    def post(self, request):
        with transaction.atomic():
            # Dentro de la transacción: dos solicitudes simultáneas no pueden
            # crear dos dueños iniciales.
            if User.objects.exists():
                raise PermissionDenied("El programa ya tiene un dueño configurado.")
            serializer = UserCreateSerializer(data={**request.data, "role": Role.OWNER})
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
        return Response(_session_payload(user), status=status.HTTP_201_CREATED)


# --- Sesión ----------------------------------------------------------------


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        update_last_login(None, user)
        return Response(_session_payload(user))


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


# --- Administración de usuarios (solo el dueño) ----------------------------


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Listar, crear, consultar y editar usuarios.

    No hay DELETE: un usuario con operaciones se desactiva con is_active = false.
    """

    queryset = User.objects.all()
    permission_classes = [IsOwner]
    http_method_names = ["get", "post", "patch"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        if self.action == "set_password":
            return SetPasswordSerializer
        return UserSerializer

    def update(self, request, *args, **kwargs):
        # La comprobación de «al menos un dueño activo» y el guardado van en la
        # misma transacción para que dos cambios simultáneos no la burlen.
        with transaction.atomic():
            return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        user = serializer.save()
        if not user.is_active:
            # Un usuario desactivado pierde de inmediato su sesión abierta.
            Token.objects.filter(user=user).delete()

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        serializer = SetPasswordSerializer(user, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # La contraseña cambió: se cierra la sesión que tuviera abierta.
        Token.objects.filter(user=user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _session_payload(user):
    """Abre una sesión nueva: cada inicio reemplaza el token anterior del usuario."""
    Token.objects.filter(user=user).delete()
    token = Token.objects.create(user=user)
    return {"token": token.key, "user": UserSerializer(user).data}
