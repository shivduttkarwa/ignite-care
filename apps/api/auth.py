"""Session login for a same-origin front end.

Deliberately cookie-based rather than a token in browser storage. The session
cookie is httpOnly, so a cross-site script cannot read it, which matters more
here than it would on a marketing site. When the mobile app arrives it gets
token authentication alongside this - DRF supports both at once.
"""

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_view(request):
    """Hand the front end a CSRF token before it posts anything."""
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "That username and password did not match."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.is_active:
        return Response(
            {"detail": "That account has been deactivated."},
            status=status.HTTP_403_FORBIDDEN,
        )

    login(request, user)
    profile = getattr(user, "staff_profile", None)
    return Response(
        {
            "id": user.pk,
            "username": user.username,
            "full_name": user.get_full_name(),
            "is_manager": bool(user.is_superuser or (profile and profile.is_manager)),
        }
    )


@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)
