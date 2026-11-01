from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("users", views.UserViewSet, basename="user")

urlpatterns = [
    path("setup/status", views.SetupStatusView.as_view(), name="setup-status"),
    path("setup/owner", views.SetupOwnerView.as_view(), name="setup-owner"),
    path("auth/login", views.LoginView.as_view(), name="login"),
    path("auth/logout", views.LogoutView.as_view(), name="logout"),
    path("auth/me", views.MeView.as_view(), name="me"),
    *router.urls,
]
