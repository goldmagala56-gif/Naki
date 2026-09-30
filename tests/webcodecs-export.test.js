'use strict';
// node tests/webcodecs-export.test.js
const assert = require('assert');
const W = require('../www/webcodecs-export.js');
const { Mp4Muxer, demuxMp4Video } = W;

const avcC = new Uint8Array([1,0x42,0xE0,0x28,0xFF,0xE1,0,3,1,2,3,1,0,2,4,5]);
const chunk = (ts,dur,key,size,fill) => { const d=new Uint8Array(size).fill(fill);
  return {byteLength:size,timestamp:ts,duration:dur,type:key?'key':'delta',copyTo(b){b.set(d);}}; };

const muxer = new Mp4Muxer(640,360);
for (let i=0;i<300;i++) muxer.addVideoChunk(
  chunk(Math.round(i*1e6/30),33333,i%60===0,500+(i%7)*37,i&255),
  i===0?{decoderConfig:{codec:'avc1.42E028',description:avcC}}:undefined);
for (let i=0;i<200;i++) muxer.addAudioChunk(chunk(Math.round(i*21333),21333,false,128+(i%3)*11,i&255));

const mp4 = muxer.finalize();
const back = demuxMp4Video(mp4);          // <- currently fails here
assert.strictEqual(back.codec, 'avc1.42E028');
assert.strictEqual(back.samples.length, 300);
assert.strictEqual(back.info.width, 640);
console.log('round-trip ok');