# Referenz: Coding-Standards & Projekt-Konventionen

_Ergänzen die globalen Defaults. Die verbindliche Fassung steht in der
projekteigenen [`CLAUDE.md`](../CLAUDE.md); dieses Dokument hält die Begründung
dahinter fest._

## Sprache

- **Alles, was ins Repo eingecheckt wird, ist immer Englisch** — Code,
  Kommentare, Dateinamen, Zusatzfiles, README, Dokumentation.
- **PRs und Commit-Messages: immer Englisch.**
- **GitHub-Issues:** dürfen Deutsch sein (Englisch ist auch ok).
- **Ausnahme 1: nutzer-sichtbarer Text ist Deutsch** — UI-Beschriftungen,
  Meldungen, Info-Karten. Am Bestand orientieren, nichts übersetzen.
- **Ausnahme 2: die Referenz-Dokumente unter `docs/` dürfen Deutsch sein.** Sie
  sind Denk- und Begründungsmaterial, kein Code.

## Benennung

- Namen **für sich sprechend, ohne Entwickler-Abkürzungen**. Fach-Abkürzungen
  (LV95, GTFS) ok; unklarere (z. B. **CSA**) **ausschreiben**. Lieber jedes Mal
  ein **langer Name** als zusätzliche Denkanstrengung.
- **Jede Funktion tut genau eine Sache**, im Namen beschrieben.
- **Iteration** über sprach-typische Muster (`forEach`/`map`/`reduce`), **kein**
  C-Style-Index (`for (i=0; i<n; i++)`).

## Typisierung

- **Python: vollständig typisiert** (Signaturen tragen Input/Output). Tooling:
  mypy strict + django-stubs + ruff-Annotation-Regeln.
- **Python-Tests: typisiert, soweit trivial möglich.** Sobald Mocks uns aus dem
  Typsystem drängen und nur fürs Mocking eigene Typen nötig würden, darf die
  Typisierung entfallen. Der ruff-`ANN`-Ignore für Tests (und Migrations) bildet
  das ab.
- **JS: untypisiert** (bundler-frei) → dafür die Kommentar-Ausnahme unten.

## Kommentare

- **Keine Methoden-Docstrings** — _was_ eine Methode tut, ergibt sich aus dem
  **Namen**; _was rein/raus geht_ aus **Argument-Namen + Typen**. Ausnahme: eine
  wesentliche Eigenschaft ihrer Bedeutung, die die Signatur nicht trägt.
- **Erlaubt:** kurze, konzise **Klassen-/Modul-Docstrings** (die Verantwortung)
  — als Docstring, nicht als `#`-Kommentar. Triviale Module/Klassen brauchen
  keinen.
- **Keine Prototyp-/Portierungs-Hinweise** („übernommen aus …", Werkzeugnamen
  von Wegwerf-Prototypen) — diese Herkunft gehört nicht in ausgelieferten Code.
- **Inline-Kommentare nur** bei einem **überraschenden Mechanismus**, den der
  Code selbst nicht erklärt — und **vorher immer abwägen**, ob ein Refactoring
  (klar benannte Methode / explizit benannte Zwischenvariable) es besser
  beschreibt. Daher **äusserst selten**.
- **JS-Ausnahme:** ein Kommentar an einer JS-Methode darf **Anforderungen an die
  Parameter** beschreiben, sofern nicht aus den Param-Namen selbsterklärend.

## Struktur

- **Objektorientiert by default.** Nur bei **web-request-unabhängigen
  Prozeduren** (Daily Jobs) dürfen Klassen entfallen.

## Config & Secrets

- **Kein Verweis auf Hostnamen / reale Infrastruktur im Repo.** Alles in `.env`
  (Dev) bzw. **Ansible-Vault-injizierte Env** (Prod). Django kennt kein
  eingebautes „encrypted credentials" — env-basiert ist der Idiom-Weg.

## Tooling

- **Backend:** ruff (Format + Lint, black-kompatibel) · mypy strict +
  django-stubs · pytest + pytest-django.
- **Frontend:** biome (Format + Lint für js/json/css) + prettier
  (md/yaml/Django-Templates) · `node:test` (Node nur Dev-Werkzeug, Laufzeit
  bleibt bundler-frei) · Tests zielen auf **reine Logik**.
- **Githooks:** `pre-commit` (Format + Lint bei jedem Commit; **Tests nicht** im
  Hook, sondern in CI).
- **Tests einfach ausführbar:** pro Sprache **ein arg-loser Befehl**; bei
  mehreren Test-Arten ein zusammenfassendes Skript.
