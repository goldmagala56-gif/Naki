'use strict';
// node tests/webcodecs-export.test.js
const assert = require('assert');
const { Mp4Muxer, demuxMp4Video } = require('../www/mp4mux.js');

const avcC = new Uint8Array([1,0x42,0xE0,0x28,0xFF,0xE1,0,3,1,2,3,1,0,2,4,5]);
const chunk = (ts,dur,key,size,fill) => { const d=new Uint8Array(size).fill(fill);
  return {byteLength:size,timestamp:ts,duration:dur,type:key?'key':'delta',copyTo(b){b.set(d);}}; };

const muxer = new Mp4Muxer(640,360);
for (let i=0;i<300;i++) muxer.addVideoChunk(
  chunk(Math.round(i*1e6/30),33333,i%60===0,500+(i%7)*37,i&255),
  i===0?{decoderConfig:{codec:'avc1.42E028',description:avcC}}:undefined);
for (let i=0;i<200;i++) muxer.addAudioChunk(chunk(Math.round(i*21333),21333,false,128+(i%3)*11,i&255));

const mp4 = muxer.finalize();
const back = demuxMp4Video(mp4);      
assert.strictEqual(back.codec, 'avc1.42E028');
assert.strictEqual(back.samples.length, 300);
assert.strictEqual(back.info.width, 640);
assert.strictEqual(back.info.height, 360);
assert.deepStrictEqual(Array.from(back.description), Array.from(avcC));
assert.strictEqual(back.samples.filter(s => s.isKey).length, 5);
back.samples.forEach((s, i) => {
  assert.strictEqual(s.size, 500 + (i % 7) * 37);
  assert(s.data.every(x => x === (i & 255)), 'payload mismatch at ' + i);
});
assert(Math.abs(back.info.durationUs - 10000000) < 40000);
console.log('round-trip ok');