// Reduce the triangle count of a single-mesh GLB (Tripo export) with meshoptimizer, keeping its
// vertices, UVs and textures. Usage: node scripts/simplify-glb.mjs in.glb out.glb targetTriangles
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , input, output, targetArg] = process.argv;
const target = Number(targetArg ?? 1000);
const buf = readFileSync(input);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
let bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));

await MeshoptSimplifier.ready;
const view = (acc) => {
  const bv = json.bufferViews[acc.bufferView];
  return bin.subarray((bv.byteOffset ?? 0) + (acc.byteOffset ?? 0));
};
for (const mesh of json.meshes) {
  for (const prim of mesh.primitives) {
    const pa = json.accessors[prim.attributes.POSITION];
    const pb = view(pa);
    const pos = new Float32Array(pb.buffer.slice(pb.byteOffset, pb.byteOffset + pa.count * 12));
    const ia = json.accessors[prim.indices];
    const ib = view(ia);
    const idx =
      ia.componentType === 5125
        ? new Uint32Array(ib.buffer.slice(ib.byteOffset, ib.byteOffset + ia.count * 4))
        : Uint32Array.from(new Uint16Array(ib.buffer.slice(ib.byteOffset, ib.byteOffset + ia.count * 2)));
    // Leaves are open sheets, so their borders are not locked; the error bound (relative to the model
    // size) keeps their outlines recognisable.
    const [res, err] = MeshoptSimplifier.simplify(idx, pos, 3, target * 3, 0.06, []);
    console.log(`${mesh.name}: ${idx.length / 3} -> ${res.length / 3} triangles (error ${err.toFixed(4)})`);
    // Append the new indices to the binary chunk and point the accessor at them.
    const pad = (4 - (bin.length % 4)) % 4;
    const offset = bin.length + pad;
    bin = Buffer.concat([bin, Buffer.alloc(pad), Buffer.from(new Uint32Array(res).buffer)]);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: res.length * 4, target: 34963 });
    ia.bufferView = json.bufferViews.length - 1;
    ia.byteOffset = 0;
    ia.componentType = 5125;
    ia.count = res.length;
  }
}
json.buffers[0].byteLength = bin.length;
let jsonBuf = Buffer.from(JSON.stringify(json));
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPad.length, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(jsonBuf.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(binPad.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(output, Buffer.concat([header, jh, jsonBuf, bh, binPad]));
console.log('wrote', output);
