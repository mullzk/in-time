from pipeline.network.access import SpatialGrid

# LV95 metres.
A = (2600000.0, 1200000.0)
B = (2600050.0, 1200000.0)
C = (2600400.0, 1200000.0)
FAR = (2700000.0, 1200000.0)


def grid() -> SpatialGrid:
    return SpatialGrid({"a": A, "b": B, "c": C}, cell_metres=200.0)


def test_nearest_returns_the_closest_node_within_reach() -> None:
    query = (2600010.0, 1200000.0)  # 10 m from A, 40 m from B
    assert grid().nearest(query, max_distance=100.0) == "a"


def test_nearest_crosses_cell_boundaries() -> None:
    # C sits two cells away from A; a query next to C must still find C even
    # though its own cell is empty.
    query = (2600395.0, 1200000.0)
    assert grid().nearest(query, max_distance=50.0) == "c"


def test_nearest_returns_none_beyond_max_distance() -> None:
    assert grid().nearest(FAR, max_distance=100.0) is None


def test_within_returns_every_node_inside_the_radius() -> None:
    query = (2600010.0, 1200000.0)
    assert set(grid().within(query, radius=100.0)) == {"a", "b"}
    assert set(grid().within(query, radius=500.0)) == {"a", "b", "c"}


def test_within_is_empty_when_nothing_is_close() -> None:
    assert grid().within(FAR, radius=100.0) == []
