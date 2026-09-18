import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getAudioDuration } from '../lib/audio-duration'
import { assembleVideo, assembleFullVideo } from '../lib/video-assembler'
import type { VisualDirective } from '../lib/visual-director'

async function main() {
  const dir=await mkdtemp(path.join(os.tmpdir(),'amf-assembly-test-'))
  const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-y',...args],{stdio:'pipe'})
  const probe=(file:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',file],{encoding:'utf8'}))
  try {
    const audio=path.join(dir,'audio.mp3'), source=path.join(dir,'clip.mp4'), output=path.join(dir,'broll.mp4')
    ff(['-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','libmp3lame','-q:a','2',audio])
    ff(['-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=0.5','-c:v','libx264',source])
    assert.ok(Math.abs(getAudioDuration(audio)-2)<0.05)
    const directives=[0,1].map(i=>({startSec:i,endSec:i+1,clipDurationSec:1,effect:'flash-cut'} as VisualDirective))
    const clip={id:'test',url:'',localPath:source,durationSec:0.5,width:320,height:180,source:'cache' as const}
    const identity={colorPrimary:'#000',colorAccent:'#fff',signatureMotif:null,visualTrack:'nature-epic'}
    const input={audioPath:audio,directives,clips:new Map([[0,clip],[1,clip]]),identity,outputPath:output,title:'test'}
    await assembleVideo(input)
    assert.ok(Math.abs(Number(probe(output).format.duration)-2)<0.034)
    assert.equal(probe(output).streams[0].width,1920)
    await assembleFullVideo({introPath:null,brollPath:output,audioPath:audio,srtPath:null,outputPath:path.join(dir,'final.mp4')})
    await assert.rejects(()=>assembleVideo({...input,clips:new Map()}),/Missing source clip/)
    await assert.rejects(()=>assembleFullVideo({introPath:null,brollPath:source,audioPath:audio,srtPath:null,outputPath:path.join(dir,'bad.mp4')}),/timeline too short/)
    console.log('video assembly integration tests passed')
  } finally { await rm(dir,{recursive:true,force:true}) }
}
main().catch(e=>{console.error(e);process.exitCode=1})
