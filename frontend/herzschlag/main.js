const root = document.body;

async function bootstrap() {
  const response = await fetch(root.dataset.configUrl);
  if (!response.ok) {
    return;
  }
  const config = await response.json();
  root.dataset.serviceDate = config.serviceDate;
}

bootstrap();
