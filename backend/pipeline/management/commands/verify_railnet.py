import time
from pathlib import Path

import networkx as nx
from django.core.management.base import BaseCommand, CommandParser

from pipeline.railnet import RailRouter
from pipeline.railnet_gdb import load_rail_graph


class Command(BaseCommand):
    help = "Load the BAV rail network GDB and report graph/routing diagnostics."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--gdb", required=True, help="Path to schienennetz_*.gdb")

    def handle(self, *args: object, **options: object) -> None:
        gdb_path = Path(str(options["gdb"]))

        started = time.monotonic()
        rail_graph = load_rail_graph(gdb_path)
        load_seconds = time.monotonic() - started

        graph = rail_graph.graph
        components_before = nx.number_connected_components(graph)

        started = time.monotonic()
        router = RailRouter(rail_graph)
        build_seconds = time.monotonic() - started

        edge_points = sum(len(edge) for edge in router.edges)
        components_after = router.component_count()

        self.stdout.write(f"GDB:                {gdb_path}")
        self.stdout.write(f"rail graph nodes:   {graph.number_of_nodes()}")
        self.stdout.write(f"rail graph edges:   {graph.number_of_edges()}")
        self.stdout.write(f"DiDok stations:     {len(rail_graph.didok_to_node)}")
        self.stdout.write(f"shared edges:       {len(router.edges)} (simplified)")
        self.stdout.write(f"shared edge points: {edge_points}")
        self.stdout.write(
            f"components:         {components_before} -> {components_after} "
            f"(after bridging)"
        )
        self.stdout.write(f"load time:          {load_seconds:.1f}s")
        self.stdout.write(f"build time:         {build_seconds:.1f}s")
