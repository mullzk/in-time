from django.contrib.staticfiles.storage import ManifestStaticFilesStorage

# Django's own import pattern expects the quoted path to be followed by the
# statement's semicolon, so an import attribute between the two keeps it from
# matching. The instrumentation documents are imported that way and change far
# more often than the code around them, which is exactly the case a content
# hash exists for.
# The attribute may be written over several lines and with a trailing comma --
# that is what the formatter makes of the longer paths -- so every gap here has
# to tolerate a line break.
JSON_MODULE_IMPORT_PATTERN = (
    r"""(?P<matched>import\s+(?P<binding>[\w$]+)\s+from\s*"""
    r"""["'](?P<url>[./].*?)["']\s*with\s*\{\s*type\s*:\s*["']json["']\s*,?\s*\}\s*;)""",
    """import %(binding)s from "%(url)s" with { type: "json" };""",
)


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
    _our_module_patterns = (JSON_MODULE_IMPORT_PATTERN, *_module_import_patterns)
    patterns = ManifestStaticFilesStorage.patterns + (
        ("takt/*.js", _our_module_patterns),
        ("viz-core/*.js", _our_module_patterns),
    )
