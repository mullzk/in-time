from django.contrib.staticfiles.storage import ManifestStaticFilesStorage


class HashedStaticFilesStorage(ManifestStaticFilesStorage):
    """Content-hashes static filenames so browsers never serve stale copies.

    Also rewrites the relative import paths inside our ES modules, so a
    change anywhere in the module graph changes the hash of every importer.
    Django's blanket ``support_js_module_import_aggregation`` flag is left
    off: its regexes false-positive on string literals inside the minified
    vendor bundles, so the rewrite patterns are applied only to our own
    module trees. Vendor bundles import nothing, so they need no rewriting.
    """

    # The private attribute is untyped in django-stubs; duplicating the
    # regexes here instead would drift on Django upgrades.
    _module_import_patterns = (
        ManifestStaticFilesStorage._js_module_import_aggregation_patterns[1]  # type: ignore[attr-defined]
    )
    patterns = ManifestStaticFilesStorage.patterns + (
        ("takt/*.js", _module_import_patterns),
        ("viz-core/*.js", _module_import_patterns),
    )
