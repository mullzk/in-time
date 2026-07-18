from django.conf import settings
from django.urls import include, path

from config.views import health

urlpatterns = [
    path("health/", health),
    path("", include("web.urls")),
]

# In production nginx serves /artifacts/ from the published `current` symlink and
# Django never sees these paths. The dev server has no such proxy, so serve the
# artifact directory ourselves to keep the local stack self-contained.
if settings.DEBUG:
    from django.views.static import serve

    from pipeline.datadir import DataDir

    urlpatterns += [
        path(
            "artifacts/<path:path>",
            serve,
            {"document_root": DataDir(settings.DATA_DIR).artifacts},
        ),
    ]
