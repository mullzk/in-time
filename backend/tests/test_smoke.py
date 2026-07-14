import pytest
from django.db import connection
from django.test import Client


def test_health_endpoint_responds(client: Client) -> None:
    response = client.get("/health/")
    assert response.status_code == 200
    assert response.content == b"ok"


@pytest.mark.django_db
def test_database_is_reachable() -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        assert cursor.fetchone() == (1,)
