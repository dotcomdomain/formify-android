import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
const ffmpeg=process.argv[2];
if(!ffmpeg)throw new Error('Pass the FFmpeg executable path');
await mkdir('fonts',{recursive:true});await mkdir('edit',{recursive:true});
await copyFile('C:/Users/Patrick/Tools/formify-android/fonts/YoungSerif-Regular.ttf','fonts/YoungSerif.ttf');
await copyFile('C:/Users/Patrick/Tools/formify-android/fonts/BricolageGrotesque.ttf','fonts/Bricolage.ttf');
const run=args=>new Promise((resolve,reject)=>{const p=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-filter_complex_threads','2',...args],{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',data=>error+=data);p.on('exit',code=>code===0?resolve():reject(new Error(error)));p.on('error',reject);});
const round=n=>Math.round(n*30)/30;
const rawShots=(JSON.parse(await readFile('shots.json','utf8'))).shots;
const probe=JSON.parse(execFileSync(ffmpeg.replace(/ffmpeg\.exe$/i,'ffprobe.exe'),['-v','error','-show_entries','format=duration','-of','json','formify-demo-raw.mp4'],{windowsHide:true,encoding:'utf8'}));
const recordedDuration=Number(probe.format.duration);
// Android starts its MP4 clock at the encoder's first frame, after the adb process launches.
const captureLeadIn=rawShots.at(-1).end-recordedDuration;
const shots=rawShots.map(shot=>({...shot,start:Math.max(0,shot.start-captureLeadIn),end:Math.min(recordedDuration,shot.end-captureLeadIn)}));
const captions={
 discover:['A better way to arrive.','Find clinics, shops and more.\nOne place to start.'],
 search:['Find what you need.','Search by what you need.\nChoose the right business.'],
 forms:['Every form, in one place.','Browse the business’s forms.\nChoose how you want to fill.'],
 fill:['Fill ahead, from your phone.','Preview the form before you arrive.\nReview before you submit.'],
 assistant:['Start with a conversation.','Prefer a little guidance?\nOpen the Formify assistant.'],
 account:['A calmer account screen.','Switch sign-in and account creation.\nThe screen stays right where it is.'],
 theme:['Make it feel like you.','Warm or blue, smoothly.\nYour details stay in place.'],
 finish:['Ready when you are.','Find a business. Fill ahead.\nA little less waiting.']
};
const text=async(name,value)=>{const path=`edit/${name}.txt`;await writeFile(path,value);return path};
const draw=(path,size,color,x,y,font='Bricolage',extra='')=>`drawtext=fontfile=fonts/${font}.ttf:textfile=${path}:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}:line_spacing=12${extra}`;
const brand=await text('brand','Formify.');
const android=await text('android','FORMIFY FOR ANDROID');
const url=await text('url','getformify.pages.dev');
const introTitle=await text('intro-title','A little less waiting.');
const introSub=await text('intro-sub','Find a business. Fill ahead. Walk in.');
const endTitle=await text('end-title','Find. Fill. Go.');
const preview=await text('preview','App preview · No check-in submitted');
const cream='0xf5efe4',forest='0x1f4d3a',clay='0xd4673a',muted='0x6b6f66';
const codec=['-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-threads','4','-an'];
const segments=[];
console.log('Editing opening card');
const introDuration=3.2;
const introFilter=[`drawbox=x=90:y=420:w=900:h=3:color=${forest}@0.2:t=fill`,draw(android,30,forest,'(w-tw)/2',510),draw(brand,150,forest,'(w-tw)/2',660,'YoungSerif'),draw(introTitle,58,clay,'(w-tw)/2',890,'YoungSerif'),draw(introSub,34,muted,'(w-tw)/2',1000),draw(url,32,forest,'(w-tw)/2',1460),`fade=t=in:st=0:d=0.45:color=${cream}`].join(',');
await run(['-f','lavfi','-i',`color=c=${cream}:s=1080x1920:r=30:d=${introDuration}`,'-vf',introFilter,...codec,'edit/00-intro.mp4']);
segments.push({file:'edit/00-intro.mp4',duration:introDuration});
for(let i=0;i<shots.length;i++){
 const shot=shots[i],duration=round(shot.end-shot.start),[title,caption]=captions[shot.key];
 console.log('Editing '+shot.key);
 const heading=await text(shot.key+'-title',title),description=await text(shot.key+'-caption',caption),count=await text(shot.key+'-count',`${String(i+1).padStart(2,'0')} / ${String(shots.length).padStart(2,'0')}`);
 const overlay=[draw(android,26,clay,90,48),draw(heading,49,forest,90,104,'YoungSerif'),`drawbox=x=177:y=227:w=726:h=1478:color=${forest}@0.28:t=2`,draw(description,36,forest,'(w-tw)/2',1740),draw(count,24,clay,90,1855),draw(url,25,muted,'w-tw-90',1855)].join(',');
 const filter=`[0:v]crop=1080:2208:0:128,scale=720:1472:flags=lanczos,fps=30,setsar=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1[app];color=c=${cream}:s=1080x1920:r=30:d=${duration}[bg];[bg][app]overlay=180:230:shortest=1,${overlay}[v]`;
 const file=`edit/${String(i+1).padStart(2,'0')}-${shot.key}.mp4`;
 await run(['-ss',String(shot.start),'-t',String(duration),'-i','formify-demo-raw.mp4','-filter_complex',filter,'-map','[v]','-t',String(duration),...codec,file]);
 segments.push({file,duration});
}
console.log('Editing closing card');
const outroDuration=3.7;
const outroFilter=[draw(android,30,clay,'(w-tw)/2',610),draw(endTitle,108,forest,'(w-tw)/2',760,'YoungSerif'),draw(url,44,forest,'(w-tw)/2',990),draw(preview,27,muted,'(w-tw)/2',1390),`drawbox=x=180:y=1520:w=720:h=4:color=${forest}@0.25:t=fill`,`fade=t=out:st=3.1:d=0.6:color=${cream}`].join(',');
await run(['-f','lavfi','-i',`color=c=${cream}:s=1080x1920:r=30:d=${outroDuration}`,'-vf',outroFilter,...codec,'edit/99-outro.mp4']);
segments.push({file:'edit/99-outro.mp4',duration:outroDuration});
const dissolve=0.24;
let duration=segments.reduce((sum,s)=>sum+s.duration,0)-dissolve*(segments.length-1);
// Original quiet ambient bed, synthesized locally; no licensed music or recorded microphone audio.
const sampleRate=48000,frames=Math.ceil(duration*sampleRate),pcm=Buffer.alloc(44+frames*4);
pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(2,22);pcm.writeUInt32LE(sampleRate,24);pcm.writeUInt32LE(sampleRate*4,28);pcm.writeUInt16LE(4,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(frames*4,40);
const chords=[[57,60,64,69],[53,57,60,65],[48,55,60,64],[55,59,62,67]],frequency=note=>440*2**((note-69)/12);
const pad=(chord,t,channel)=>chord.reduce((sum,n,index)=>sum+Math.sin(2*Math.PI*frequency(n)*(1+channel*.0008)*t+index*.7)*.007,0);
for(let i=0;i<frames;i++){
 const t=i/sampleRate,chordIndex=Math.floor(t/5)%4,phase=(t%5),blend=Math.min(phase/.7,1),chord=chords[chordIndex],old=chords[(chordIndex+3)%4],step=Math.floor(t/.625),note=chord[[0,2,1,3][step%4]]+12,local=t%.625;
 const pluck=(Math.sin(2*Math.PI*frequency(note)*local)+.12*Math.sin(4*Math.PI*frequency(note)*local))*.022*Math.min(local/.014,1)*Math.exp(-local*7);
 const envelope=Math.min(t/1.6,1)*Math.min((duration-t)/2.4,1);
 for(let channel=0;channel<2;channel++){
  const sample=((pad(chord,t,channel)*blend+pad(old,t,channel)*(1-blend))*.7+pluck*(channel?.8:1))*envelope;
  pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*4+channel*2);
 }
}
await writeFile('edit/original-ambient.wav',pcm);
console.log('Compositing final video');
const inputs=segments.flatMap(s=>['-threads','2','-i',s.file]);inputs.push('-i','edit/original-ambient.wav');
const filters=segments.map((_,i)=>`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[v${i}]`);
let offset=segments[0].duration-dissolve,last='v0';
for(let i=1;i<segments.length;i++){
 const next=`x${i}`;filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${dissolve}:offset=${offset.toFixed(5)}[${next}]`);
 last=next;offset+=segments[i].duration-dissolve;
}
await run([...inputs,'-filter_complex',filters.join(';'),'-map',`[${last}]`,'-map',`${segments.length}:a`,'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-threads','4','-c:a','aac','-b:a','128k','-af','volume=14dB','-ar','48000','-t',duration.toFixed(5),'-movflags','+faststart','Formify-Demo.mp4']);
await writeFile('edit.json',JSON.stringify({duration,format:'1080x1920, 30 fps, H.264/AAC',captureLeadIn,segments,dissolve,audio:'Original synthesized ambient bed; no third-party music'},null,2));
console.log(`Done: ${duration.toFixed(1)} seconds`);
