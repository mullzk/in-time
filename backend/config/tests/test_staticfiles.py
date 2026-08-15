from pathlib import Path

from django.core.management import call_command
from django.test import override_settings

from config.staticfiles import HashedStaticFilesStorage

IMPORTER = "viz-core/sonification/presets.js"
DOCUMENT = "viz-core/sonification/instrumentations/marimba-gm.json"


def _collect(source: Path, target: Path) -> dict[str, str]:
    storage = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "config.staticfiles.HashedStaticFilesStorage",
        },
    }
    with override_settings(
        STATIC_ROOT=str(target), STATICFILES_DIRS=[str(source)], STORAGES=storage
    ):
        call_command("collectstatic", interactive=False, verbosity=0)
        return {
            name: HashedStaticFilesStorage().stored_name(name)
            for name in (IMPORTER, DOCUMENT)
        }


def _write_module_tree(root: Path, gain: float) -> None:
    document = root / DOCUMENT
    document.parent.mkdir(parents=True, exist_ok=True)
    document.write_text(
        f'{{ "instrumentation": "Marimba (GM)", "sound": "marimba", "gain": {gain} }}\n'
    )
    # Written the way biome formats it: single quotes, and once the path grows
    # long enough, the attribute broken over lines with a trailing comma.
    (root / IMPORTER).write_text(
        "import marimba from './instrumentations/marimba-gm.json' with {\n"
        "  type: 'json',\n"
        "};\n"
        "export const INSTRUMENTATIONS = [marimba];\n"
    )


def test_a_json_import_points_at_the_hashed_document(tmp_path: Path) -> None:
    source = tmp_path / "source"
    _write_module_tree(source, gain=0.4)

    hashed = _collect(source, tmp_path / "first")

    importer = (tmp_path / "first" / hashed[IMPORTER]).read_text()
    assert Path(hashed[DOCUMENT]).name in importer
    assert 'with { type: "json" }' in importer


def test_changing_a_document_changes_the_hash_of_its_importer(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    _write_module_tree(source, gain=0.4)
    before = _collect(source, tmp_path / "before")

    _write_module_tree(source, gain=0.5)
    after = _collect(source, tmp_path / "after")

    assert after[DOCUMENT] != before[DOCUMENT]
    assert after[IMPORTER] != before[IMPORTER]
