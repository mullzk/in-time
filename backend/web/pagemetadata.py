from dataclasses import dataclass

SITE_NAME = "All in Time"


@dataclass(frozen=True)
class PageMetadata:
    """What a page tells search engines and link previews about itself."""

    name: str
    description: str
    canonical_path: str
    indexable: bool = True

    @property
    def title(self) -> str:
        return f"{self.name} — {SITE_NAME}"


TAKT = PageMetadata(
    name="Takt",
    description=(
        "All in Time macht den Schweizer Taktfahrplan sicht- und hörbar: der "
        "Fahrplan des heutigen Tages als pulsierende Bewegung auf der Karte, "
        "wahlweise vertont."
    ),
    canonical_path="/takt",
)

KASKADE = PageMetadata(
    name="Kaskade",
    description=(
        "Wie weit kommt man von einer Haltestelle aus? Die Kaskade zeigt, wie "
        "sich die Erreichbarkeit im Schweizer Taktfahrplan über den Tag "
        "ausbreitet."
    ),
    canonical_path="/kaskade",
)

ZEITKARTE = PageMetadata(
    name="Zeitkarte",
    description=(
        "Die Zeitkarte ordnet die Schweiz radial nach Reisezeit: wie lange die "
        "Fahrt von einer Haltestelle zu jeder anderen im Taktfahrplan dauert."
    ),
    canonical_path="/zeitkarte",
)

PULS = PageMetadata(
    name="Puls",
    description=(
        "Der Puls der Schweizer Bahnknoten: wie sie sich mit den Zügen füllen, "
        "die zur vollen und zur halben Stunde in ihnen stehen."
    ),
    canonical_path="/puls",
    indexable=False,
)
