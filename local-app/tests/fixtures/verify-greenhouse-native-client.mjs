// Compare the fixture against the complete, independently acquired public asset.
// Usage: node local-app/tests/fixtures/verify-greenhouse-native-client.mjs [full-source.js]
// This script never downloads or executes the supplied source.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const metadata=JSON.parse(await fs.readFile(path.join(here,'greenhouse-native-client-source.json'),'utf8'));
const source=await fs.readFile(process.argv[2]||path.join(root,'.runtime/public-source',metadata.source.file));
const fixture=await fs.readFile(path.join(here,metadata.fixture.file));
assert.equal(source.length,metadata.source.bytes,'Complete public asset byte count');
assert.equal(digest(source),metadata.source.sha256,'Complete public asset SHA-256');
assert.equal(fixture.length,metadata.fixture.bytes,'Fixture byte count');
assert.equal(digest(fixture),metadata.fixture.sha256,'Fixture SHA-256');
const names=new Set();
let sourceEnd=0,fixtureEnd=0;
for(const segment of metadata.segments){
  assert.ok(!names.has(segment.name),'Duplicate source segment');names.add(segment.name);
  assert.ok(Number.isInteger(segment.startByte)&&Number.isInteger(segment.endByteExclusive)&&segment.startByte>=sourceEnd&&segment.endByteExclusive>segment.startByte&&segment.endByteExclusive<=source.length,'Valid ordered source byte range');
  assert.ok(Number.isInteger(segment.fixtureStartByte)&&Number.isInteger(segment.fixtureEndByteExclusive)&&segment.fixtureStartByte>=fixtureEnd&&segment.fixtureEndByteExclusive>segment.fixtureStartByte&&segment.fixtureEndByteExclusive<=fixture.length,'Valid ordered fixture byte range');
  const original=source.subarray(segment.startByte,segment.endByteExclusive);
  const extracted=fixture.subarray(segment.fixtureStartByte,segment.fixtureEndByteExclusive);
  assert.equal(original.length,segment.bytes,segment.name+' source byte count');
  assert.equal(digest(original),segment.sha256,segment.name+' original SHA-256');
  assert.deepEqual(extracted,original,segment.name+' exact byte extraction');
  sourceEnd=segment.endByteExclusive;fixtureEnd=segment.fixtureEndByteExclusive;
}
assert.deepEqual([...names],['kt','Us','lt','La','Ta','Ot','$s','Ma','Ia','Fa','Ra','Oa','Da','to'],'Required original helpers and functions');
assert.equal(digest(await fs.readFile(path.join(root,metadata.schema.path))),metadata.schema.sha256,'Observed public schema SHA-256');
console.log(JSON.stringify({verified:true,sourceSHA256:digest(source),sourceBytes:source.length,fixtureSHA256:digest(fixture),fixtureBytes:fixture.length,exactSegments:names.size,schemaSHA256:metadata.schema.sha256}));
