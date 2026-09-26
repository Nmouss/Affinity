#!/usr/bin/env node
/**
 * Procedurally generates small, reliable GLB (binary glTF 2.0) product models
 * for the Three.js demo, without relying on GLTFExporter (which needs a
 * browser FileReader). Geometry is built with three's geometry classes,
 * merged per-material, and the GLB container is assembled by hand:
 *   - 12 byte GLB header (magic 'glTF', version 2, total length)
 *   - JSON chunk (glTF document), padded to a 4-byte boundary with spaces
 *   - BIN chunk (interleaved-free vertex/index buffers), padded to a
 *     4-byte boundary with zero bytes
 *
 * The mission room's coffee table is part of the Hearth living room, so only products are built here.
 *
 * Run from the repo root:
 *   node scripts/mission/make-product-models.mjs
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', '..', 'public', 'models');

// ---------------------------------------------------------------------------
// Small helpers for building transformed, indexed geometry per model part.
// ---------------------------------------------------------------------------

/** Bake a matrix into a clone of `geometry` and make sure it is indexed with normals. */
function part(geometry, matrix, materialKey) {
  const geo = geometry.clone();
  if (matrix) geo.applyMatrix4(matrix);
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.index) {
    // All the primitive geometries we use (Box/Cylinder/Torus/Lathe/Sphere)
    // are indexed by default, but guard anyway for safety.
    const nonIndexed = geo.toNonIndexed();
    const posCount = nonIndexed.getAttribute('position').count;
    const idx = new Uint32Array(posCount);
    for (let i = 0; i < posCount; i++) idx[i] = i;
    nonIndexed.setIndex(new THREE.BufferAttribute(idx, 1));
    return { geometry: nonIndexed, materialKey };
  }
  return { geometry: geo, materialKey };
}

const M = THREE.Matrix4;
function mat({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3(x, y, z);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
  const scale = new THREE.Vector3(sx, sy, sz);
  m.compose(pos, quat, scale);
  return m;
}

// ---------------------------------------------------------------------------
// Shared material palette (PBR metallic/roughness, no textures).
// ---------------------------------------------------------------------------

const MATERIALS = {
  metalDark: { baseColorFactor: [0.15, 0.15, 0.17, 1], metallicFactor: 0.8, roughnessFactor: 0.35 },
  metalLight: { baseColorFactor: [0.75, 0.76, 0.78, 1], metallicFactor: 0.9, roughnessFactor: 0.2 },
  amberGlass: { baseColorFactor: [0.85, 0.55, 0.15, 1], metallicFactor: 0.0, roughnessFactor: 0.2 },
  coolerBody: { baseColorFactor: [0.82, 0.14, 0.14, 1], metallicFactor: 0.0, roughnessFactor: 0.6 },
  coolerLid: { baseColorFactor: [0.92, 0.92, 0.9, 1], metallicFactor: 0.0, roughnessFactor: 0.55 },
  mugBody: { baseColorFactor: [0.86, 0.82, 0.74, 1], metallicFactor: 0.0, roughnessFactor: 0.4 },
  pressGlass: { baseColorFactor: [0.78, 0.88, 0.92, 1], metallicFactor: 0.0, roughnessFactor: 0.12 },
  pressMetal: { baseColorFactor: [0.72, 0.73, 0.76, 1], metallicFactor: 0.85, roughnessFactor: 0.25 },
  stoveBody: { baseColorFactor: [0.18, 0.19, 0.21, 1], metallicFactor: 0.3, roughnessFactor: 0.5 },
  woodLight: { baseColorFactor: [0.62, 0.42, 0.26, 1], metallicFactor: 0.0, roughnessFactor: 0.7 },
  woodDark: { baseColorFactor: [0.4, 0.27, 0.16, 1], metallicFactor: 0.0, roughnessFactor: 0.65 },
};

// ---------------------------------------------------------------------------
// Model definitions. Each returns an array of { geometry, materialKey }.
// Units: meters, origin at base center, +Y up.
// ---------------------------------------------------------------------------

function buildLantern() {
  const parts = [];
  // Base
  parts.push(part(new THREE.CylinderGeometry(0.09, 0.1, 0.04, 24), mat({ y: 0.02 }), 'metalDark'));
  // Glass body
  parts.push(part(new THREE.CylinderGeometry(0.075, 0.08, 0.16, 24), mat({ y: 0.12 }), 'amberGlass'));
  // Cap
  parts.push(part(new THREE.CylinderGeometry(0.02, 0.085, 0.04, 24), mat({ y: 0.22 }), 'metalDark'));
  // Handle (half-torus arch over the top)
  parts.push(
    part(new THREE.TorusGeometry(0.07, 0.007, 8, 24, Math.PI), mat({ y: 0.22 }), 'metalDark')
  );
  return parts;
}

function buildStove() {
  const parts = [];
  // Body
  parts.push(part(new THREE.BoxGeometry(0.32, 0.26, 0.3), mat({ y: 0.13 }), 'stoveBody'));
  // Burner rings on top
  parts.push(
    part(new THREE.TorusGeometry(0.05, 0.008, 8, 24), mat({ x: -0.08, y: 0.26, z: 0.03, rx: Math.PI / 2 }), 'metalDark')
  );
  parts.push(
    part(new THREE.TorusGeometry(0.05, 0.008, 8, 24), mat({ x: 0.08, y: 0.26, z: -0.03, rx: Math.PI / 2 }), 'metalDark')
  );
  // Knobs on front face (+Z)
  parts.push(
    part(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), mat({ x: -0.08, y: 0.07, z: 0.155, rx: Math.PI / 2 }), 'metalLight')
  );
  parts.push(
    part(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), mat({ x: 0.08, y: 0.07, z: 0.155, rx: Math.PI / 2 }), 'metalLight')
  );
  return parts;
}

function buildCooler() {
  const parts = [];
  // Body
  parts.push(part(new THREE.BoxGeometry(0.34, 0.2, 0.22), mat({ y: 0.1 }), 'coolerBody'));
  // Lid
  parts.push(part(new THREE.BoxGeometry(0.35, 0.04, 0.23), mat({ y: 0.22 }), 'coolerLid'));
  // Latch
  parts.push(part(new THREE.BoxGeometry(0.03, 0.05, 0.02), mat({ y: 0.19, z: 0.125 }), 'metalDark'));
  // Handle (half-torus arch on top of lid)
  parts.push(
    part(new THREE.TorusGeometry(0.07, 0.006, 8, 24, Math.PI), mat({ y: 0.24 }), 'metalDark')
  );
  return parts;
}

function buildMug() {
  const parts = [];
  // Lathe profile: (radius, height) pairs, bottom to top. Double wall so the
  // mug reads as hollow: goes up the outside, then back down the inside.
  const profile = [
    [0.0, 0.0],
    [0.06, 0.0],
    [0.062, 0.012],
    [0.06, 0.19],
    [0.063, 0.215],
    [0.06, 0.226],
    [0.05, 0.226],
    [0.048, 0.205],
    [0.05, 0.024],
    [0.0, 0.024],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  parts.push(part(new THREE.LatheGeometry(profile, 24), mat(), 'mugBody'));
  // Handle: half-torus rotated so its hole axis points radially outward,
  // attached to the +X side of the body.
  parts.push(
    part(
      new THREE.TorusGeometry(0.05, 0.009, 8, 16, Math.PI * 1.1),
      mat({ x: 0.075, y: 0.13, ry: Math.PI / 2, rz: -Math.PI * 0.05 }),
      'mugBody'
    )
  );
  return parts;
}

function buildPress() {
  const parts = [];
  // Carafe
  parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 24), mat({ y: 0.09 }), 'pressGlass'));
  // Lid
  parts.push(part(new THREE.CylinderGeometry(0.035, 0.052, 0.02, 24), mat({ y: 0.19 }), 'pressMetal'));
  // Plunger rod
  parts.push(part(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), mat({ y: 0.26 }), 'pressMetal'));
  // Plunger knob
  parts.push(part(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), mat({ y: 0.33 }), 'pressMetal'));
  // Side handle
  parts.push(
    part(
      new THREE.TorusGeometry(0.05, 0.008, 8, 20, Math.PI * 1.2),
      mat({ x: 0.09, y: 0.09, ry: Math.PI / 2, rz: -Math.PI * 0.1 }),
      'pressMetal'
    )
  );
  return parts;
}

const MODELS = {
  lantern: buildLantern,
  stove: buildStove,
  cooler: buildCooler,
  mug: buildMug,
  press: buildPress,
};

// ---------------------------------------------------------------------------
// GLB assembly
// ---------------------------------------------------------------------------

const GLTF_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_TYPE_BIN = 0x004e4942; // 'BIN\0'

function align4(n) {
  return (n + 3) & ~3;
}

/** Group parts by materialKey and merge each group into one indexed geometry. */
function mergeByMaterial(parts) {
  const groups = new Map();
  for (const p of parts) {
    if (!groups.has(p.materialKey)) groups.set(p.materialKey, []);
    groups.get(p.materialKey).push(p.geometry);
  }
  const result = [];
  for (const [materialKey, geometries] of groups) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    result.push({ materialKey, geometry: merged });
  }
  return result;
}

function buildGLB(modelName, parts) {
  const primitiveGroups = mergeByMaterial(parts);

  const materialKeys = [...new Set(primitiveGroups.map((g) => g.materialKey))];
  const materials = materialKeys.map((key) => ({
    name: key,
    pbrMetallicRoughness: {
      baseColorFactor: MATERIALS[key].baseColorFactor,
      metallicFactor: MATERIALS[key].metallicFactor,
      roughnessFactor: MATERIALS[key].roughnessFactor,
    },
  }));

  const binChunks = []; // Uint8Array pieces, concatenated in order
  let binOffset = 0;

  function pushBytes(bytes, alignment) {
    const padStart = align4(binOffset) - binOffset;
    // Only pad to the accessor's natural alignment; 4 is always safe/sufficient
    // for float32/uint32 and acceptable for uint16 per glTF recommendations.
    if (alignment && binOffset % alignment !== 0) {
      const pad = alignment - (binOffset % alignment);
      binChunks.push(new Uint8Array(pad));
      binOffset += pad;
    } else if (padStart && !alignment) {
      binChunks.push(new Uint8Array(padStart));
      binOffset += padStart;
    }
    const start = binOffset;
    binChunks.push(bytes);
    binOffset += bytes.byteLength;
    return { byteOffset: start, byteLength: bytes.byteLength };
  }

  const accessors = [];
  const bufferViews = [];
  const primitives = [];

  for (const group of primitiveGroups) {
    const geo = group.geometry;
    const posAttr = geo.getAttribute('position');
    const normAttr = geo.getAttribute('normal');
    const index = geo.getIndex();

    const vertexCount = posAttr.count;
    const posArray = Float32Array.from(posAttr.array);
    const normArray = Float32Array.from(normAttr.array);

    // POSITION
    const posBytes = new Uint8Array(posArray.buffer, posArray.byteOffset, posArray.byteLength);
    const posView = pushBytes(posBytes, 4);
    bufferViews.push({ buffer: 0, byteOffset: posView.byteOffset, byteLength: posView.byteLength, target: 34962 });
    const posBufferViewIndex = bufferViews.length - 1;

    // min/max for POSITION accessor
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i++) {
      for (let c = 0; c < 3; c++) {
        const v = posArray[i * 3 + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    accessors.push({
      bufferView: posBufferViewIndex,
      componentType: 5126, // FLOAT
      count: vertexCount,
      type: 'VEC3',
      min,
      max,
    });
    const posAccessorIndex = accessors.length - 1;

    // NORMAL
    const normBytes = new Uint8Array(normArray.buffer, normArray.byteOffset, normArray.byteLength);
    const normView = pushBytes(normBytes, 4);
    bufferViews.push({ buffer: 0, byteOffset: normView.byteOffset, byteLength: normView.byteLength, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3',
    });
    const normAccessorIndex = accessors.length - 1;

    // INDICES
    const indexArraySrc = index.array;
    const useUint32 = vertexCount > 65535;
    const indexArray = useUint32 ? Uint32Array.from(indexArraySrc) : Uint16Array.from(indexArraySrc);
    const indexBytes = new Uint8Array(indexArray.buffer, indexArray.byteOffset, indexArray.byteLength);
    const indexView = pushBytes(indexBytes, useUint32 ? 4 : 2);
    bufferViews.push({ buffer: 0, byteOffset: indexView.byteOffset, byteLength: indexView.byteLength, target: 34963 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: useUint32 ? 5125 : 5123,
      count: indexArray.length,
      type: 'SCALAR',
    });
    const indexAccessorIndex = accessors.length - 1;

    primitives.push({
      attributes: { POSITION: posAccessorIndex, NORMAL: normAccessorIndex },
      indices: indexAccessorIndex,
      material: materialKeys.indexOf(group.materialKey),
      mode: 4, // TRIANGLES
    });
  }

  // Pad the BIN buffer overall to a 4-byte boundary (GLB chunk requirement).
  if (binOffset % 4 !== 0) {
    const pad = 4 - (binOffset % 4);
    binChunks.push(new Uint8Array(pad));
    binOffset += pad;
  }
  const binBuffer = concatUint8(binChunks, binOffset);

  const gltf = {
    asset: { version: '2.0', generator: 'affinity-make-models' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: modelName }],
    meshes: [{ name: modelName, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuffer.byteLength }],
  };

  const jsonString = JSON.stringify(gltf);
  let jsonBytes = new TextEncoder().encode(jsonString);
  const jsonPad = align4(jsonBytes.byteLength) - jsonBytes.byteLength;
  if (jsonPad > 0) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPad);
    padded.set(jsonBytes, 0);
    padded.fill(0x20, jsonBytes.byteLength); // pad with spaces
    jsonBytes = padded;
  }

  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binBuffer.byteLength;
  const glb = new Uint8Array(totalLength);
  const dv = new DataView(glb.buffer);

  let offset = 0;
  dv.setUint32(offset, GLTF_MAGIC, true); offset += 4;
  dv.setUint32(offset, 2, true); offset += 4; // version
  dv.setUint32(offset, totalLength, true); offset += 4;

  dv.setUint32(offset, jsonBytes.byteLength, true); offset += 4;
  dv.setUint32(offset, CHUNK_TYPE_JSON, true); offset += 4;
  glb.set(jsonBytes, offset); offset += jsonBytes.byteLength;

  dv.setUint32(offset, binBuffer.byteLength, true); offset += 4;
  dv.setUint32(offset, CHUNK_TYPE_BIN, true); offset += 4;
  glb.set(binBuffer, offset); offset += binBuffer.byteLength;

  return Buffer.from(glb.buffer, glb.byteOffset, glb.byteLength);
}

function concatUint8(chunks, totalLength) {
  const out = new Uint8Array(totalLength);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verification: re-parse the raw GLB bytes, then load through GLTFLoader.
// ---------------------------------------------------------------------------

function verifyGLBStructure(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0, true);
  const version = dv.getUint32(4, true);
  const totalLength = dv.getUint32(8, true);
  if (magic !== GLTF_MAGIC) throw new Error('bad magic');
  if (version !== 2) throw new Error('bad version');
  if (totalLength !== buf.byteLength) throw new Error(`length mismatch: header ${totalLength} vs file ${buf.byteLength}`);

  const jsonChunkLength = dv.getUint32(12, true);
  const jsonChunkType = dv.getUint32(16, true);
  if (jsonChunkType !== CHUNK_TYPE_JSON) throw new Error('first chunk is not JSON');
  const jsonStart = 20;
  const jsonText = Buffer.from(buf.buffer, buf.byteOffset + jsonStart, jsonChunkLength).toString('utf8');
  const json = JSON.parse(jsonText); // throws if invalid

  const binStart = jsonStart + jsonChunkLength;
  const binChunkLength = dv.getUint32(binStart, true);
  const binChunkType = dv.getUint32(binStart + 4, true);
  if (binChunkType !== CHUNK_TYPE_BIN) throw new Error('second chunk is not BIN');
  const binDataStart = binStart + 8;

  const bufferByteLength = json.buffers?.[0]?.byteLength ?? 0;
  if (bufferByteLength > binChunkLength) {
    throw new Error(`declared buffer length ${bufferByteLength} exceeds BIN chunk length ${binChunkLength}`);
  }

  for (const [i, view] of (json.bufferViews || []).entries()) {
    const end = view.byteOffset + view.byteLength;
    if (end > binChunkLength) {
      throw new Error(`bufferView ${i} range [${view.byteOffset}, ${end}) exceeds BIN chunk length ${binChunkLength}`);
    }
  }

  for (const [i, acc] of (json.accessors || []).entries()) {
    if (acc.bufferView == null) continue;
    const view = json.bufferViews[acc.bufferView];
    const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
    const numComponents = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
    const accByteLength = acc.count * numComponents * compSize;
    if (accByteLength > view.byteLength) {
      throw new Error(`accessor ${i} byte length ${accByteLength} exceeds its bufferView length ${view.byteLength}`);
    }
  }

  return {
    magic: 'glTF',
    version,
    totalLength,
    jsonChunkLength,
    binChunkLength,
    binDataStart,
    meshCount: json.meshes?.length ?? 0,
    primitiveCount: json.meshes?.reduce((n, m) => n + m.primitives.length, 0) ?? 0,
    accessorCount: json.accessors?.length ?? 0,
  };
}

async function verifyWithGLTFLoader(buf) {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return await new Promise((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      '',
      (gltf) => {
        let meshCount = 0;
        gltf.scene.traverse((obj) => {
          if (obj.isMesh) meshCount++;
        });
        resolve({ meshCount });
      },
      (err) => reject(err)
    );
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = [];
  for (const [name, build] of Object.entries(MODELS)) {
    const parts = build();
    const glb = buildGLB(name, parts);
    const outPath = path.join(OUT_DIR, `${name}.glb`);
    fs.writeFileSync(outPath, glb);

    const structural = verifyGLBStructure(glb);
    const loaded = await verifyWithGLTFLoader(glb);

    report.push({
      name,
      path: outPath,
      bytes: glb.byteLength,
      kb: (glb.byteLength / 1024).toFixed(1),
      structural,
      loaded,
    });
  }

  console.log('\nGenerated GLB models:\n');
  for (const r of report) {
    const okSize = r.bytes < 60 * 1024 ? 'OK' : 'TOO BIG';
    console.log(`  ${r.name}.glb  ${r.kb} KB (${r.bytes} bytes)  [size: ${okSize}]`);
    console.log(
      `    structural: v${r.structural.version}, json=${r.structural.jsonChunkLength}B, bin=${r.structural.binChunkLength}B, ` +
        `meshes=${r.structural.meshCount}, primitives=${r.structural.primitiveCount}, accessors=${r.structural.accessorCount}`
    );
    console.log(`    GLTFLoader.parse: OK, meshCount=${r.loaded.meshCount}`);
  }

  const anyTooBig = report.some((r) => r.bytes >= 60 * 1024);
  const anyNoMesh = report.some((r) => r.loaded.meshCount < 1);
  if (anyTooBig || anyNoMesh) {
    console.error('\nVerification FAILED.');
    process.exit(1);
  }
  console.log('\nAll models generated and verified successfully.');
}

main().catch((err) => {
  console.error('make-models.mjs failed:', err);
  process.exit(1);
});
