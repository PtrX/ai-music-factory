import assert from 'node:assert/strict'
import { buildDirectives } from '../lib/visual-director'
import type { TrackStructure } from '../lib/ai-rating'
const identity = { colorPrimary: '#000000', colorAccent: '#ffffff', signatureMotif: null, visualTrack: 'nature-epic' }
const structure: TrackStructure = {
  sections: [{type:'verse',startSec:0,endSec:120,energy:'medium'}],
  suggestedVersionName:'',bpmDetected:120,keySignature:null,totalDurationSec:120,
  tiktokBestStartSec:0,tiktokBestEndSec:30,
  beatTimes:Array.from({length:240},(_,i)=>i/2),beatStrength:Array(240).fill(0.5),
}
assert.throws(()=>buildDirectives({...structure,beatTimes:[]},identity,'house',120,8), /Beat analysis missing/)
assert.throws(()=>buildDirectives(structure,identity,'house',246,8), /gap longer/)
const ds=buildDirectives(structure,identity,'house',100,8)
assert.equal(ds[0].startSec,8)
assert.equal(ds.at(-1)!.endSec,100)
for(let i=0;i<ds.length;i++) {
  assert.ok(ds[i].endSec<=100)
  if(i) assert.equal(ds[i].startSec,ds[i-1].endSec)
  assert.ok(Math.abs(ds[i].startSec*30-Math.round(ds[i].startSec*30))<1e-6)
  assert.ok(ds[i].endSec-ds[i].startSec<=4)
}
console.log('video timeline regression tests passed')
