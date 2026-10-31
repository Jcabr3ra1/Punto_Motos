from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsOwner(BasePermission):
    """Solo el dueño (rol administrador)."""

    message = "Solo el dueño puede realizar esta acción."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_owner)


class IsOwnerOrReadOnly(BasePermission):
    """Cualquier usuario con sesión consulta; solo el dueño modifica."""

    message = IsOwner.message

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or request.user.is_owner
