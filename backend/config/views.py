from django.http import HttpRequest, HttpResponse


def health(request: HttpRequest) -> HttpResponse:
    return HttpResponse("ok", content_type="text/plain")
