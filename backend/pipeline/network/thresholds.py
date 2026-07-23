"""Tunable distance thresholds for building and routing the rail network."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RoutingThresholds:
    simplify_tolerance_metres: float = 30.0
    component_bridge_max_metres: float = 150.0
    max_entry_metres: float = 1500.0
    entry_candidate_radius_metres: float = 400.0
    detour_factor: float = 4.0
    detour_slack_metres: float = 4000.0
    recover_slack_metres: float = 10000.0


# Immutable shared default, so it can serve as a call-free argument default.
DEFAULT_THRESHOLDS = RoutingThresholds()
