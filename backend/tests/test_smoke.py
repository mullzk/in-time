from django.test import Client


def test_health_endpoint_responds(client: Client) -> None:
    response = client.get("/health/")
    assert response.status_code == 200
    assert response.content == b"ok"
