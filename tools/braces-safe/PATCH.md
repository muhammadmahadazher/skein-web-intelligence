# Skein's bounded braces patch

This directory vendors the MIT-licensed npm `braces@3.0.3` tarball
(SHA-1 `490332f40919452272d55a8480adc0c441358789`). The upstream LICENSE,
README, attribution, and implementation are preserved.
The package manifest omits upstream development-only tooling and scripts:
Skein tests the patch from its root test suite, without installing obsolete
Mocha/Gulp dependencies from a linked local package.

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects every published version at the time of this patch (2026-10-09).
The parser and compile/expand/stringify walkers now enforce a fixed depth
ceiling of 128. Normal globs retain their upstream behavior. Deep input fails
with `ERR_BRACES_DEPTH` before recursive stack exhaustion; options cannot
disable the guard. Direct AST entry points are guarded too.

The local package version is `3.0.3-skein.1`; npm's audit service does not
evaluate local source patches. Its audit result must be read alongside the
executable regression tests in `tests/braces-safety.test.mjs`.

Replace this override with an upstream release once its depth protection is
verified against those tests. Do not suppress the advisory for the unpatched
registry package.
