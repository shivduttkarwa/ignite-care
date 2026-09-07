from .models import Home

SESSION_KEY = "active_home_id"


class ActiveHomeMiddleware:
    """Keeps the home the worker picked at the start of their shift on the request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.active_home = None
        request.available_homes = Home.objects.none()

        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            profile = getattr(user, "staff_profile", None)
            if user.is_superuser:
                homes = Home.objects.filter(is_active=True)
            elif profile is not None:
                homes = profile.homes.filter(is_active=True)
            else:
                homes = Home.objects.none()

            request.available_homes = homes
            home_id = request.session.get(SESSION_KEY)
            request.active_home = homes.filter(pk=home_id).first() or homes.first()
            if request.active_home:
                request.session[SESSION_KEY] = request.active_home.pk

        return self.get_response(request)
