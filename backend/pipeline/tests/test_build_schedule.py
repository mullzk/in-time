from pipeline.management.commands.build_schedule import reload_runner


def test_reload_runner_is_a_noop_for_an_empty_command() -> None:
    reload_runner([])()


def test_reload_runner_invokes_a_configured_command() -> None:
    calls: list[list[str]] = []
    reload_runner(["true"], runner=calls.append)()

    assert calls == [["true"]]
