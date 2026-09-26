# 3D models

Product GLB models used by the Three.js demo. All six are generated
procedurally (no external assets) by the script at
`frontend/scripts/make-models.mjs`. Regenerate them from `frontend/` with:

```
npm run models
```

That command builds each model's geometry with three.js primitives
(`CylinderGeometry`, `BoxGeometry`, `TorusGeometry`, `LatheGeometry`, etc.),
merges parts sharing a material, and hand-assembles a binary glTF 2.0 (GLB)
container — no `GLTFExporter` dependency, so it runs in plain Node. The
script also re-parses each file (raw chunk/accessor validation plus
`GLTFLoader.parse`) to confirm it's a valid, loadable GLB before finishing.

## Models

| File          | Description                                                              |
| ------------- | ------------------------------------------------------------------------- |
| `lantern.glb` | Metal base and cap with an amber glass-like body and a torus handle.      |
| `stove.glb`   | Boxy stove body with two burner rings on top and two front knobs.         |
| `cooler.glb`  | Boxy cooler with a lid, a latch, and a top carry handle.                  |
| `mug.glb`     | Lathe-turned ceramic mug body with a torus handle.                        |
| `press.glb`   | French press: carafe, lid, plunger rod with a knob, and a side handle.    |
| `table.glb`   | Round wooden tabletop (~1.6 m diameter) on a pedestal and base.           |

Each file is under 60 KB and contains one mesh with one primitive per
material (`pbrMetallicRoughness`, no textures).
