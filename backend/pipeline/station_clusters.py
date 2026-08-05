"""Groups stops that GTFS transfers.txt ties together into one physical
interchange, so the sonification can treat a rail station and its neighbouring
tram and bus stops -- distinct DiDoks at the same place, e.g. "Bern" and "Bern,
Bahnhof" -- as a single sonified station. Stops named by a transfer are merged
into one group in DiDok space: platforms already share their station's DiDok, so
no parent-station step is needed. Each cluster is named by its smallest didok."""

import csv
from pathlib import Path

from pipeline.gtfs import swiss_didok_by_stop_id


class _MergedStops:
    """Keeps merged stops in groups, each answering to one representative
    didok. A union-find under another name: `merge` is its union, and
    `representative_of` its find, halving the chain it walks as it goes."""

    def __init__(self) -> None:
        self._representative: dict[int, int] = {}

    def representative_of(self, didok: int) -> int:
        self._representative.setdefault(didok, didok)
        while self._representative[didok] != didok:
            self._representative[didok] = self._representative[
                self._representative[didok]
            ]
            didok = self._representative[didok]
        return didok

    def merge(self, first: int, second: int) -> None:
        first_representative = self.representative_of(first)
        second_representative = self.representative_of(second)
        if first_representative != second_representative:
            self._representative[first_representative] = second_representative


def load_station_clusters(gtfs_dir: Path) -> dict[int, int]:
    stop_to_didok = swiss_didok_by_stop_id(gtfs_dir)
    transfers = gtfs_dir / "transfers.txt"
    if not transfers.exists():
        return {}

    merged = _MergedStops()
    with open(transfers, encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            from_didok = stop_to_didok.get(row["from_stop_id"])
            to_didok = stop_to_didok.get(row["to_stop_id"])
            if from_didok is not None and to_didok is not None:
                merged.merge(from_didok, to_didok)

    members: dict[int, set[int]] = {}
    for didok in set(stop_to_didok.values()):
        members.setdefault(merged.representative_of(didok), set()).add(didok)

    clusters: dict[int, int] = {}
    for group in members.values():
        if len(group) > 1:
            representative = min(group)
            for didok in group:
                clusters[didok] = representative
    return clusters
