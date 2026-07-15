from django.db import models


class BuildCommand(models.TextChoices):
    SCHEDULE = "build_schedule"
    ACTUALS = "build_actuals"


class BuildStatus(models.TextChoices):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class BuildRun(models.Model):
    # Permanent ledger of pipeline runs: what was built for which day from which
    # GTFS feed version, and how it ended. Drives skip-if-done and operations.
    command = models.CharField(max_length=32, choices=BuildCommand.choices)
    status = models.CharField(
        max_length=16, choices=BuildStatus.choices, default=BuildStatus.RUNNING
    )
    service_date = models.DateField()
    source_version = models.CharField(max_length=128, blank=True)
    artifact_path = models.CharField(max_length=512, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    message = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["command", "service_date", "status"]),
        ]
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"{self.command} {self.service_date} [{self.status}]"
