#!/usr/bin/env node
/**
 * Builds the rigged عم عبده avatar from the static scan.
 *
 * The source GLB is a trimesh export: one mesh with POSITION + COLOR_0, no
 * materials, no normals and — critically — no skeleton. It is also modelled
 * lying along +X, so a humanoid skeleton has to be attached before the asset
 * can idle, speak or greet. This script is the deterministic, offline step that
 * produces `icons/assistant-abbah-3d-rigged.glb`:
 *
 *   1. bakes the +90° Z rotation into POSITION so the figure is Y-up,
 *   2. adds a 21-joint humanoid skeleton whose landmarks come from the mesh,
 *   3. skins every vertex with smooth distance weights (top 4, quantised to
 *      normalised bytes) plus a jaw bone restricted to the lower face,
 *   4. adds the Idle / Talk / Greet clips.
 *
 * Run `node scripts/rig-assistant-model.mjs` to write the asset, or
 * `node scripts/rig-assistant-model.mjs --check` to fail when the committed
 * asset no longer matches this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_PATH = 'icons/assistant-abbah-3d.glb';
export const OUTPUT_PATH = 'icons/assistant-abbah-3d-rigged.glb';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;
const UBYTE = 5121;
const USHORT = 5123;
const ARRAY_BUFFER = 34962;

/**
 * Skeleton landmarks in the baked (Y-up, +Z forward) mesh space. Radii are the
 * reach of each bone's distance weight; the torso reaches further because the
 * galabeya is a single wide silhouette.
 */
export const BONES = [
    { name: 'root', parent: null, pos: [0, 0, 0] },
    { name: 'hips', parent: 'root', pos: [0, 0.02, 0.01], tail: [0, 0.14, 0.02], radius: 0.15 },
    { name: 'spine', parent: 'hips', pos: [0, 0.14, 0.02], tail: [0, 0.245, 0.03], radius: 0.13 },
    { name: 'chest', parent: 'spine', pos: [0, 0.245, 0.03], tail: [0.012, 0.335, 0.05], radius: 0.16 },
    { name: 'neck', parent: 'chest', pos: [0.012, 0.335, 0.05], tail: [0.022, 0.362, 0.06], radius: 0.07 },
    { name: 'head', parent: 'neck', pos: [0.022, 0.362, 0.06], tail: [0.022, 0.474, 0.085], radius: 0.135 },
    { name: 'jaw', parent: 'head', pos: [0.022, 0.362, 0.05], tail: [0.022, 0.338, 0.13], radius: 0 },
    { name: 'shoulder.L', parent: 'chest', pos: [0.055, 0.29, 0.02], tail: [0.115, 0.272, 0.03], radius: 0.06 },
    { name: 'upperArm.L', parent: 'shoulder.L', pos: [0.115, 0.272, 0.03], tail: [0.17, 0.155, 0.035], radius: 0.08 },
    { name: 'lowerArm.L', parent: 'upperArm.L', pos: [0.17, 0.155, 0.035], tail: [0.19, 0.04, 0.05], radius: 0.075 },
    { name: 'hand.L', parent: 'lowerArm.L', pos: [0.19, 0.04, 0.05], tail: [0.19, -0.02, 0.065], radius: 0.065 },
    { name: 'shoulder.R', parent: 'chest', pos: [-0.055, 0.29, 0.02], tail: [-0.115, 0.272, 0.03], radius: 0.06 },
    { name: 'upperArm.R', parent: 'shoulder.R', pos: [-0.115, 0.272, 0.03], tail: [-0.17, 0.155, 0.035], radius: 0.08 },
    { name: 'lowerArm.R', parent: 'upperArm.R', pos: [-0.17, 0.155, 0.035], tail: [-0.19, 0.04, 0.05], radius: 0.075 },
    { name: 'hand.R', parent: 'lowerArm.R', pos: [-0.19, 0.04, 0.05], tail: [-0.19, -0.02, 0.065], radius: 0.065 },
    { name: 'thigh.L', parent: 'hips', pos: [0.05, 0, 0.015], tail: [0.065, -0.23, 0.015], radius: 0.1 },
    { name: 'shin.L', parent: 'thigh.L', pos: [0.065, -0.23, 0.015], tail: [0.07, -0.425, 0.005], radius: 0.1 },
    { name: 'foot.L', parent: 'shin.L', pos: [0.07, -0.425, 0.005], tail: [0.07, -0.448, 0.1], radius: 0.08 },
    { name: 'thigh.R', parent: 'hips', pos: [-0.05, 0, 0.015], tail: [-0.065, -0.23, 0.015], radius: 0.1 },
    { name: 'shin.R', parent: 'thigh.R', pos: [-0.065, -0.23, 0.015], tail: [-0.07, -0.425, 0.005], radius: 0.1 },
    { name: 'foot.R', parent: 'shin.R', pos: [-0.07, -0.425, 0.005], tail: [-0.07, -0.448, 0.1], radius: 0.08 }
];

const JAW_CENTER = [0.022, 0.36, 0.12];
const JAW_REACH = 0.078;

/**
 * Clip keyframes. Rotation tracks hold degrees per axis; a translation track
 * holds a Y offset from the bone's bind position.
 */
export const CLIPS = [
    {
        name: 'Idle',
        duration: 3.2,
        tracks: [
            { bone: 'chest', path: 'rotation', x: [[0, 0], [0.8, -0.45], [1.6, -0.6], [2.4, -0.45], [3.2, 0]] },
            { bone: 'head', path: 'rotation', x: [[0, 0], [0.8, -0.25], [1.6, -0.35], [2.4, -0.25], [3.2, 0]] },
            { bone: 'hips', path: 'translation', y: [[0, 0], [1.6, -0.0022], [3.2, 0]] }
        ]
    },
    {
        name: 'Talk',
        duration: 2.4,
        tracks: [
            {
                bone: 'jaw', path: 'rotation',
                x: [[0, 0], [0.14, 9], [0.28, 0.6], [0.44, 7.5], [0.6, 0], [0.8, 9.5], [0.98, 0.6], [1.2, 8], [1.42, 0], [2.4, 0]]
            },
            {
                bone: 'head', path: 'rotation',
                x: [[0, 0], [0.3, 1.2], [0.7, 0.2], [1.1, 0.9], [1.5, 0], [2.4, 0]],
                y: [[0, 0], [0.3, 1.8], [0.7, 0], [1.1, -1.2], [1.5, 0], [2.4, 0]]
            },
            { bone: 'chest', path: 'rotation', x: [[0, 0], [0.6, 0.4], [1.2, 0], [1.8, 0.3], [2.4, 0]] }
        ]
    },
    {
        name: 'Greet',
        duration: 2.6,
        tracks: [
            { bone: 'hips', path: 'rotation', x: [[0, 0], [0.75, 2], [1.35, 2], [2.15, 0], [2.6, 0]] },
            { bone: 'chest', path: 'rotation', x: [[0, 0], [0.75, 9], [1.35, 9], [2.15, 0], [2.6, 0]] },
            { bone: 'neck', path: 'rotation', x: [[0, 0], [0.75, 3], [1.35, 3], [2.15, 0], [2.6, 0]] },
            { bone: 'head', path: 'rotation', x: [[0, 0], [0.75, 4.5], [1.35, 4.5], [2.15, 0], [2.6, 0]] }
        ]
    }
];

export function parseGlb(buffer) {
    if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB file');
    if (buffer.readUInt32LE(4) !== 2) throw new Error('only glTF 2.0 is supported');
    if (buffer.readUInt32LE(8) !== buffer.length) throw new Error('GLB length header mismatch');
    const jsonLength = buffer.readUInt32LE(12);
    if (buffer.readUInt32LE(16) !== JSON_CHUNK) throw new Error('first chunk must be JSON');
    const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
    const binStart = 20 + jsonLength;
    let bin = Buffer.alloc(0);
    if (binStart < buffer.length) {
        if (buffer.readUInt32LE(binStart + 4) !== BIN_CHUNK) throw new Error('second chunk must be BIN');
        bin = Buffer.from(buffer.subarray(binStart + 8, binStart + 8 + buffer.readUInt32LE(binStart)));
    }
    return { json, bin };
}

export function writeGlb(json, bin) {
    let jsonText = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonPad = (4 - (jsonText.length % 4)) % 4;
    if (jsonPad) jsonText = Buffer.concat([jsonText, Buffer.alloc(jsonPad, 0x20)]);
    const binPad = (4 - (bin.length % 4)) % 4;
    const binOut = binPad ? Buffer.concat([bin, Buffer.alloc(binPad, 0)]) : bin;
    const out = Buffer.alloc(12 + 8 + jsonText.length + 8 + binOut.length);
    out.writeUInt32LE(GLB_MAGIC, 0);
    out.writeUInt32LE(2, 4);
    out.writeUInt32LE(out.length, 8);
    out.writeUInt32LE(jsonText.length, 12);
    out.writeUInt32LE(JSON_CHUNK, 16);
    jsonText.copy(out, 20);
    out.writeUInt32LE(binOut.length, 20 + jsonText.length);
    out.writeUInt32LE(BIN_CHUNK, 24 + jsonText.length);
    binOut.copy(out, 28 + jsonText.length);
    return out;
}

function readFloatArray(json, bin, index) {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const bytes = bin.subarray(start, start + view.byteLength);
    const values = new Float32Array(accessor.count * 3);
    for (let i = 0; i < values.length; i += 1) values[i] = bytes.readFloatLE(i * 4);
    return values;
}

function readIndices(json, bin, index) {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const bytes = bin.subarray(start, start + view.byteLength);
    const values = accessor.componentType === USHORT
        ? new Uint16Array(accessor.count)
        : new Uint32Array(accessor.count);
    for (let i = 0; i < accessor.count; i += 1) {
        values[i] = accessor.componentType === USHORT ? bytes.readUInt16LE(i * 2) : bytes.readUInt32LE(i * 4);
    }
    return values;
}

function distanceToSegment(px, py, pz, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
    const lengthSquared = abx * abx + aby * aby + abz * abz;
    let t = lengthSquared ? (apx * abx + apy * aby + apz * abz) / lengthSquared : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}

function quaternionAroundAxis(axis, degrees) {
    const half = (degrees * Math.PI) / 360;
    const sin = Math.sin(half);
    const cos = Math.cos(half);
    return axis === 'x' ? [sin, 0, 0, cos] : [0, sin, 0, cos];
}

/**
 * Rotates the scan upright in place and computes four normalised skin
 * influences per vertex. Exported so tests can re-derive and inspect the rig.
 */
export function computeSkin(positions, indices, bones = BONES) {
    const count = positions.length / 3;
    // The scan is authored lying along +X with the head at +X; +90° about Z
    // turns +X into +Y, the upright pose confirmed in the source renders.
    for (let i = 0; i < count; i += 1) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        positions[i * 3] = -y;
        positions[i * 3 + 1] = x;
    }

    const weighted = bones
        .map((bone, index) => ({ bone, index }))
        .filter(entry => entry.bone.radius > 0);
    const jawIndex = bones.findIndex(bone => bone.name === 'jaw');
    const joints = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);

    for (let i = 0; i < count; i += 1) {
        const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
        const candidates = [];
        let nearest = null;
        for (const { bone, index } of weighted) {
            const distance = distanceToSegment(px, py, pz, bone.pos, bone.tail);
            const score = distance / bone.radius;
            if (nearest === null || score < nearest.score) nearest = { index, score };
            if (distance < bone.radius) {
                const w = (1 - score) ** 2;
                if (w > 0) candidates.push({ index, w });
            }
        }

        // The scan has no blendshapes, so face articulation comes from a jaw
        // bone that only claims the lower face.
        const inFace = py > 0.33 && py < 0.383 && pz > 0.085 && Math.abs(px - 0.022) < 0.06;
        let jawWeight = 0;
        if (inFace) {
            const reach = Math.hypot(px - JAW_CENTER[0], py - JAW_CENTER[1], pz - JAW_CENTER[2]);
            jawWeight = Math.max(0, 1 - reach / JAW_REACH) ** 1.5 * 0.95;
        }

        if (!candidates.length) candidates.push({ index: nearest.index, w: 1 });
        candidates.sort((a, b) => b.w - a.w);
        const top = candidates.slice(0, 4);
        const sum = top.reduce((total, entry) => total + entry.w, 0);
        for (let slot = 0; slot < 4; slot += 1) {
            const entry = top[slot];
            const base = entry ? (entry.w / sum) * (1 - jawWeight) : 0;
            weights[i * 4 + slot] = base;
            joints[i * 4 + slot] = entry ? entry.index : 0;
        }
        if (jawWeight > 0) {
            // Always keep the jaw influence instead of letting it fall off the
            // top-four list, and shift the remaining weight to it.
            weights[i * 4 + 3] += jawWeight;
            joints[i * 4 + 3] = jawIndex;
        }
    }

    // Two Laplacian passes over the mesh topology soften bone borders so the
    // galabeya deforms as one surface instead of creasing.
    const neighbours = Array.from({ length: count }, () => []);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        neighbours[a].push(b, c);
        neighbours[b].push(a, c);
        neighbours[c].push(a, b);
    }
    for (let pass = 0; pass < 2; pass += 1) {
        const nextWeights = new Float32Array(weights.length);
        const nextJoints = new Uint16Array(joints.length);
        for (let i = 0; i < count; i += 1) {
            const entries = new Map();
            for (let slot = 0; slot < 4; slot += 1) {
                const joint = joints[i * 4 + slot];
                entries.set(joint, (entries.get(joint) || 0) + weights[i * 4 + slot] * 0.5);
            }
            const ring = neighbours[i];
            const share = ring.length ? 0.5 / ring.length : 0;
            for (const j of ring) {
                for (let slot = 0; slot < 4; slot += 1) {
                    const joint = joints[j * 4 + slot];
                    entries.set(joint, (entries.get(joint) || 0) + weights[j * 4 + slot] * share);
                }
            }
            const top = [...entries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
            const sum = top.reduce((total, entry) => total + entry[1], 0);
            for (let slot = 0; slot < 4; slot += 1) {
                const entry = top[slot];
                nextWeights[i * 4 + slot] = entry ? entry[1] / sum : 0;
                nextJoints[i * 4 + slot] = entry ? entry[0] : 0;
            }
        }
        weights.set(nextWeights);
        joints.set(nextJoints);
    }

    return { joints, weights, count };
}

/** Largest-remainder quantisation so every row sums to exactly 255. */
function quantiseWeights(row) {
    const total = row.reduce((sum, value) => sum + value, 0) || 1;
    const scaled = row.map(value => (value / total) * 255);
    const floors = scaled.map(value => Math.floor(value));
    let remainder = 255 - floors.reduce((sum, value) => sum + value, 0);
    const order = scaled
        .map((value, slot) => ({ slot, fraction: value - floors[slot] }))
        .sort((a, b) => b.fraction - a.fraction || a.slot - b.slot);
    for (const { slot } of order) {
        if (remainder <= 0) break;
        floors[slot] += 1;
        remainder -= 1;
    }
    return floors;
}

export function buildRiggedGlb(source) {
    const { json, bin } = parseGlb(source);
    const primitive = json.meshes[0].primitives[0];
    const positionAccessor = json.accessors[primitive.attributes.POSITION];
    const vertexCount = positionAccessor.count;
    const positions = readFloatArray(json, bin, primitive.attributes.POSITION);
    const indices = readIndices(json, bin, primitive.indices);
    const skin = computeSkin(positions, indices);

    // Bake the upright pose into the existing POSITION buffer view in place.
    const positionView = json.bufferViews[positionAccessor.bufferView];
    const positionStart = positionView.byteOffset || 0;
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i += 1) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        bin.writeFloatLE(x, positionStart + i * 12);
        bin.writeFloatLE(y, positionStart + i * 12 + 4);
        bin.writeFloatLE(z, positionStart + i * 12 + 8);
        min = [Math.min(min[0], x), Math.min(min[1], y), Math.min(min[2], z)];
        max = [Math.max(max[0], x), Math.max(max[1], y), Math.max(max[2], z)];
    }
    positionAccessor.min = min;
    positionAccessor.max = max;

    const out = {
        asset: { version: '2.0', generator: 'manzil-rig-assistant-model' },
        scenes: json.scenes,
        scene: json.scene ?? 0,
        nodes: [
            { name: 'world', children: [1, 2] },
            { name: 'geometry_0', mesh: 0, skin: 0 },
            { name: 'Armature', children: [3] }
        ],
        meshes: json.meshes,
        accessors: json.accessors,
        bufferViews: json.bufferViews,
        buffers: [{ byteLength: 0 }]
    };

    const chunks = [bin];
    let binLength = bin.length;
    const append = (data, target) => {
        const pad = (4 - (binLength % 4)) % 4;
        if (pad) {
            chunks.push(Buffer.alloc(pad, 0));
            binLength += pad;
        }
        const offset = binLength;
        chunks.push(data);
        binLength += data.length;
        const view = { buffer: 0, byteOffset: offset, byteLength: data.length };
        if (target) view.target = target;
        out.bufferViews.push(view);
        return out.bufferViews.length - 1;
    };

    const jointBytes = Buffer.alloc(vertexCount * 4);
    const weightBytes = Buffer.alloc(vertexCount * 4);
    for (let i = 0; i < vertexCount; i += 1) {
        const row = [
            skin.weights[i * 4], skin.weights[i * 4 + 1],
            skin.weights[i * 4 + 2], skin.weights[i * 4 + 3]
        ];
        const quantised = quantiseWeights(row);
        for (let slot = 0; slot < 4; slot += 1) {
            jointBytes.writeUInt8(Math.min(skin.joints[i * 4 + slot], 255), i * 4 + slot);
            weightBytes.writeUInt8(quantised[slot], i * 4 + slot);
        }
    }
    const jointAccessor = out.accessors.push({
        componentType: UBYTE, type: 'VEC4', bufferView: append(jointBytes, ARRAY_BUFFER), count: vertexCount
    }) - 1;
    const weightAccessor = out.accessors.push({
        componentType: UBYTE, normalized: true, type: 'VEC4',
        bufferView: append(weightBytes, ARRAY_BUFFER), count: vertexCount
    }) - 1;
    primitive.attributes.JOINTS_0 = jointAccessor;
    primitive.attributes.WEIGHTS_0 = weightAccessor;

    // Skeleton. Bind poses are translations only, so each inverse bind matrix
    // is the inverse translation and each node keeps its parent-relative
    // offset.
    const indexOf = new Map();
    BONES.forEach((bone, index) => indexOf.set(bone.name, index));
    BONES.forEach((bone, index) => {
        const node = { name: bone.name, translation: [0, 0, 0] };
        if (bone.parent) {
            const parent = BONES[indexOf.get(bone.parent)];
            node.translation = [
                bone.pos[0] - parent.pos[0],
                bone.pos[1] - parent.pos[1],
                bone.pos[2] - parent.pos[2]
            ];
            const parentNode = out.nodes[3 + indexOf.get(bone.parent)];
            parentNode.children = parentNode.children || [];
            parentNode.children.push(3 + index);
        }
        out.nodes.push(node);
    });

    const inverseBindData = Buffer.alloc(BONES.length * 64);
    BONES.forEach((bone, index) => {
        const matrix = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            -bone.pos[0], -bone.pos[1], -bone.pos[2], 1
        ];
        matrix.forEach((value, slot) => inverseBindData.writeFloatLE(value, index * 64 + slot * 4));
    });
    const inverseBindAccessor = out.accessors.push({
        componentType: FLOAT, type: 'MAT4', bufferView: append(inverseBindData), count: BONES.length
    }) - 1;

    out.skins = [{
        name: 'AbdoRig',
        joints: BONES.map((_, index) => 3 + index),
        skeleton: 3,
        inverseBindMatrices: inverseBindAccessor
    }];
    out.animations = [];

    for (const clip of CLIPS) {
        const samplers = [];
        const channels = [];
        for (const track of clip.tracks) {
            const node = 3 + indexOf.get(track.bone);
            const times = (track.x || track.y).map(key => key[0]);
            const inputBytes = Buffer.alloc(times.length * 4);
            times.forEach((time, slot) => inputBytes.writeFloatLE(time, slot * 4));
            const inputAccessor = out.accessors.push({
                componentType: FLOAT, type: 'SCALAR', bufferView: append(inputBytes), count: times.length,
                min: [times[0]], max: [times[times.length - 1]]
            }) - 1;

            let outputAccessor;
            if (track.path === 'rotation') {
                const xAt = new Map(track.x || []);
                const yAt = new Map(track.y || []);
                const data = Buffer.alloc(times.length * 16);
                times.forEach((time, slot) => {
                    const qx = quaternionAroundAxis('x', xAt.get(time) || 0);
                    const qy = quaternionAroundAxis('y', yAt.get(time) || 0);
                    const q = [
                        qy[3] * qx[0] + qy[0] * qx[3] + qy[1] * qx[2] - qy[2] * qx[1],
                        qy[3] * qx[1] - qy[0] * qx[2] + qy[1] * qx[3] + qy[2] * qx[0],
                        qy[3] * qx[2] + qy[0] * qx[1] - qy[1] * qx[0] + qy[2] * qx[3],
                        qy[3] * qx[3] - qy[0] * qx[0] - qy[1] * qx[1] - qy[2] * qx[2]
                    ];
                    const length = Math.hypot(...q) || 1;
                    q.forEach((value, component) => data.writeFloatLE(value / length, slot * 16 + component * 4));
                });
                outputAccessor = out.accessors.push({
                    componentType: FLOAT, type: 'VEC4', bufferView: append(data), count: times.length
                }) - 1;
            } else {
                const base = BONES[indexOf.get(track.bone)].pos;
                const data = Buffer.alloc(times.length * 12);
                track.y.forEach(([, offset], slot) => {
                    data.writeFloatLE(base[0], slot * 12);
                    data.writeFloatLE(base[1] + offset, slot * 12 + 4);
                    data.writeFloatLE(base[2], slot * 12 + 8);
                });
                outputAccessor = out.accessors.push({
                    componentType: FLOAT, type: 'VEC3', bufferView: append(data), count: times.length
                }) - 1;
            }

            samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: 'LINEAR' });
            channels.push({ sampler: samplers.length - 1, target: { node, path: track.path } });
        }
        out.animations.push({ name: clip.name, samplers, channels });
    }

    out.buffers[0].byteLength = binLength;
    return writeGlb(out, Buffer.concat(chunks, binLength));
}

function main() {
    const check = process.argv.includes('--check');
    const source = fs.readFileSync(path.join(root, SOURCE_PATH));
    const built = buildRiggedGlb(source);
    const target = path.join(root, OUTPUT_PATH);
    if (check) {
        if (!fs.readFileSync(target).equals(built)) {
            console.error(`${OUTPUT_PATH} is out of date; run node scripts/rig-assistant-model.mjs`);
            process.exit(1);
        }
        console.log(`${OUTPUT_PATH} matches the rigging script (${built.length} bytes)`);
        return;
    }
    fs.writeFileSync(target, built);
    console.log(`wrote ${OUTPUT_PATH} (${built.length} bytes)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
