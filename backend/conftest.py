import pytest
from django.conf import settings


def pytest_configure(config: pytest.Config) -> None:
    """Serve unhashed static files in tests, which never run collectstatic."""
    settings.STORAGES["staticfiles"]["BACKEND"] = (
        "django.contrib.staticfiles.storage.StaticFilesStorage"
    )
