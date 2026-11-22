# Repository working instructions

- Always use the `ci-cd-pipeline-builder` skill when working in this repository,
  including PR maintenance. Read its `SKILL.md` before CI/CD changes or validation.
  On the owner's Windows machine it is available at
  `C:/Users/mahad/.agents/skills/ci-cd-pipeline-builder/SKILL.md`.
  If unavailable, report that and validate the existing pipelines explicitly.
- Check all three stacks: root npm, `services/control-plane` uv/Python, and
  `services/fetcher` Cargo/Rust. A root-only stack scan misses the services.
- Preserve lockfile-based installs, security audits, PostgreSQL integration tests,
  and deployment gates. Do not bypass failed checks to merge dependency PRs.
- Keep project work and temporary artifacts in the Drive workspace; clean up
  only artifacts created for the current task, preserving existing user files.
