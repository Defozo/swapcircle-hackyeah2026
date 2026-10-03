# Presentation sources

`submission/pitch/SwapCircle.pptx` is directly editable in PowerPoint. It contains native text, a table, embedded screenshots and speaker notes. The PDF is the presentation for submission.

`build.mjs` regenerates the deck with the Presentations skill's `@oai/artifact-tool` engine. Set `RUNTIME_NODE_MODULES` to that environment's Node modules directory and `PRESENTATIONS_SKILL_DIR` to its installed skill directory. Set `PRESENTATIONS_PYTHON` when its Python executable differs from `python` on PATH. Then run `node scripts/pitch/build.mjs` with Node.js24 or later.

The remaining helpers export and verify the deck in Microsoft PowerPoint and add the two PDF link annotations. `assets.json` identifies the reviewed screenshots from the running demo. Generation and review outputs go to `.state/pitch-build`; final artifacts go to `submission/pitch`.
