const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'icons', 'assistant-abbah-3d.glb');
const riggedPath = path.join(root, 'icons', 'assistant-abbah-3d-rigged.glb');

function parseGlb(buffer) {
    assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'GLB magic');
    assert.equal(buffer.readUInt32LE(4), 2, 'glTF 2.0');
    assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB length');
    const jsonLength = buffer.readUInt32LE(12);
    assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
    const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
    const binStart = 20 + jsonLength;
    assert.equal(buffer.readUInt32LE(binStart + 4), 0x004e4942, 'BIN chunk second');
    const bin = buffer.subarray(binStart + 8, binStart + 8 + buffer.readUInt32LE(binStart));
    return { json, bin };
}

function bufferViewBytes(json, bin, index) {
    const view = json.bufferViews[index];
    const start = view.byteOffset || 0;
    return bin.subarray(start, start + view.byteLength);
}

function accessorFloats(json, bin, index) {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const offset = view.byteOffset || 0;
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
    const values = new Float32Array(accessor.count * width);
    for (let i = 0; i < values.length; i += 1) values[i] = bin.readFloatLE(offset + i * 4);
    return values;
}

const source = fs.readFileSync(sourcePath);
const rigged = fs.readFileSync(riggedPath);
const { json, bin } = parseGlb(rigged);
const sourceGlb = parseGlb(source);
const primitive = json.meshes[0].primitives[0];
const vertexCount = json.accessors[primitive.attributes.POSITION].count;

test('the rigged avatar keeps the scanned silhouette and falls back to the PNG portraits', () => {
    assert.ok(fs.existsSync(path.join(root, 'icons', 'assistant-abbah.png')));
    assert.ok(fs.existsSync(path.join(root, 'icons', 'assistant-abbah-full.png')));
    const sourcePrimitive = sourceGlb.json.meshes[0].primitives[0];
    assert.equal(vertexCount, sourceGlb.json.accessors[sourcePrimitive.attributes.POSITION].count,
        'vertex count must not change');
    assert.equal(json.accessors[primitive.indices].count,
        sourceGlb.json.accessors[sourcePrimitive.indices].count, 'triangle count must not change');
});

test('the rig repaints the scan from the doorman palette', async () => {
    const rig = await import(pathToFileURL(path.join(root, 'scripts', 'rig-assistant-model.mjs')).href);
    const colors = json.accessors[primitive.attributes.COLOR_0];
    assert.equal(colors.type, 'VEC4');
    assert.equal(colors.normalized, true);
    const bytes = bufferViewBytes(json, bin, colors.bufferView);
    const linearByte = srgb => Math.round((srgb <= 0.04045
        ? srgb / 12.92
        : ((srgb + 0.055) / 1.055) ** 2.4) * 255);
    const expected = new Set(Object.values(rig.PALETTE)
        .map(rgb => rgb.map(linearByte).join(',')));
    const seen = new Set();
    for (let vertex = 0; vertex < colors.count; vertex += 1) {
        seen.add(`${bytes[vertex * 4]},${bytes[vertex * 4 + 1]},${bytes[vertex * 4 + 2]}`);
        assert.equal(bytes[vertex * 4 + 3], 255, 'palette repainting must leave alpha opaque');
    }
    for (const color of seen) assert.ok(expected.has(color), `unexpected vertex colour ${color}`);
    assert.equal(seen.size, expected.size, 'every palette tone must be used somewhere on the figure');
});

test('the rig carries smooth normals and a matte material so the scan can be lit', () => {
    // Without NORMAL every directional light term collapses to zero and the
    // figure renders as a flat white silhouette; the scan ships no normals.
    const normals = json.accessors[primitive.attributes.NORMAL];
    assert.ok(normals, 'NORMAL must be present');
    assert.equal(normals.count, vertexCount);
    assert.equal(normals.type, 'VEC3');
    const values = accessorFloats(json, bin, primitive.attributes.NORMAL);
    let lowest = 1;
    let highest = -1;
    for (let i = 0; i < values.length; i += 3) {
        const length = Math.hypot(values[i], values[i + 1], values[i + 2]);
        assert.ok(Math.abs(length - 1) < 1e-3, `normal ${i / 3} must be unit length`);
        lowest = Math.min(lowest, values[i + 1]);
        highest = Math.max(highest, values[i + 1]);
    }
    assert.ok(highest - lowest > 0.5, 'normals must vary across the surface');

    assert.equal(json.materials.length, 1);
    const material = json.materials[0];
    assert.equal(primitive.material, 0, 'the primitive must use the material');
    assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
    assert.ok(material.pbrMetallicRoughness.roughnessFactor >= 0.8, 'cloth must stay matte');
    assert.equal(material.doubleSided, true, 'scan holes must not reveal the backdrop');
});

test('the avatar is upright and carries a single humanoid skin', () => {
    const { min, max } = json.accessors[primitive.attributes.POSITION];
    const height = max[1] - min[1];
    const width = max[0] - min[0];
    const depth = max[2] - min[2];
    assert.ok(height > width && height > depth, 'the baked rotation must stand the figure up');
    assert.ok(height > 0.9 && height < 1.0, `unexpected height ${height}`);

    assert.equal(json.skins.length, 1);
    const skin = json.skins[0];
    assert.equal(skin.joints.length, 21);
    assert.equal(skin.skeleton, skin.joints[0]);
    assert.equal(json.accessors[skin.inverseBindMatrices].count, skin.joints.length);
    assert.equal(json.accessors[skin.inverseBindMatrices].type, 'MAT4');

    const meshNode = json.nodes.find(node => node.mesh === 0);
    assert.equal(meshNode.skin, 0, 'the mesh must render through the skin');

    const joints = json.accessors[primitive.attributes.JOINTS_0];
    const weights = json.accessors[primitive.attributes.WEIGHTS_0];
    assert.equal(joints.count, vertexCount);
    assert.equal(joints.componentType, 5121);
    assert.equal(weights.count, vertexCount);
    assert.equal(weights.componentType, 5121);
    assert.equal(weights.normalized, true);

    const jointBytes = bufferViewBytes(json, bin, joints.bufferView);
    const weightBytes = bufferViewBytes(json, bin, weights.bufferView);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        let sum = 0;
        for (let slot = 0; slot < 4; slot += 1) {
            const joint = jointBytes[vertex * 4 + slot];
            assert.ok(joint < skin.joints.length, `vertex ${vertex} points at joint ${joint}`);
            sum += weightBytes[vertex * 4 + slot];
        }
        assert.equal(sum, 255, `vertex ${vertex} weights must normalise to 255`);
    }

    // The jaw bone exists and owns the lower face, which is the only facial
    // articulation a static scan can carry without authored blendshapes.
    const jawNode = json.nodes.findIndex(node => node.name === 'jaw');
    assert.notEqual(jawNode, -1);
    const jawJointIndex = skin.joints.indexOf(jawNode);
    assert.notEqual(jawJointIndex, -1, 'the jaw must be a skin joint');
    let jawVertices = 0;
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        for (let slot = 0; slot < 4; slot += 1) {
            if (jointBytes[vertex * 4 + slot] === jawJointIndex
                && weightBytes[vertex * 4 + slot] > 12) jawVertices += 1;
        }
    }
    assert.ok(jawVertices > 200, `the jaw must drive the mouth (${jawVertices} vertices)`);
});

test('the avatar ships the idle, talk and greet clips', () => {
    assert.deepEqual(json.animations.map(clip => clip.name), ['Idle', 'Talk', 'Greet']);
    const jointNodes = new Set(json.skins[0].joints);
    for (const clip of json.animations) {
        assert.ok(clip.channels.length >= 3, `${clip.name} must animate several bones`);
        for (const channel of clip.channels) {
            assert.ok(jointNodes.has(channel.target.node), `${clip.name} must only target joints`);
            const sampler = clip.samplers[channel.sampler];
            const times = accessorFloats(json, bin, sampler.input);
            assert.equal(times[0], 0, `${clip.name} must start at 0`);
            for (let i = 1; i < times.length; i += 1) {
                assert.ok(times[i] > times[i - 1], `${clip.name} keyframes must be ordered`);
            }
            if (channel.target.path === 'rotation') {
                const quaternions = accessorFloats(json, bin, sampler.output);
                for (let i = 0; i < quaternions.length; i += 4) {
                    const norm = Math.hypot(
                        quaternions[i], quaternions[i + 1], quaternions[i + 2], quaternions[i + 3]
                    );
                    assert.ok(Math.abs(norm - 1) < 1e-4, `${clip.name} quaternions must be normalised`);
                }
            }
        }
    }
    const talk = json.animations.find(clip => clip.name === 'Talk');
    assert.ok(talk.channels.some(channel => json.nodes[channel.target.node].name === 'jaw'),
        'Talk must articulate the jaw');
    assert.ok(json.animations.find(clip => clip.name === 'Greet')
        .channels.some(channel => json.nodes[channel.target.node].name === 'chest'),
    'Greet must bow from the chest');
});

test('the committed rig matches the offline rigging script byte for byte', async () => {
    const rig = await import(pathToFileURL(path.join(root, 'scripts', 'rig-assistant-model.mjs')).href);
    const rebuilt = rig.buildRiggedGlb(source);
    assert.ok(rebuilt.equals(rigged), 'run node scripts/rig-assistant-model.mjs to regenerate');
    assert.equal(json.asset.generator, 'manzil-rig-assistant-model');
});

test('the model is fetched lazily and never joins the application shell', () => {
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    assert.ok(shell, 'APP_SHELL must exist');
    assert.ok(!shell[1].includes('assistant-abbah-3d'),
        'the rigged avatar must stay out of the precache');
});
