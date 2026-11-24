let stream=null;let facingMode="user";
export function getStream(){return stream}
export async function start(video){if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access requires HTTPS or localhost in a supported browser.");try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:1280},height:{ideal:720}}})}catch(first){stream=await navigator.mediaDevices.getUserMedia({audio:false,video:true})}video.srcObject=stream;await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject});await video.play();return stream}
export function stop(video){stream?.getTracks().forEach(track=>track.stop());stream=null;if(video)video.srcObject=null}
export async function switchCamera(video){facingMode=facingMode==="user"?"environment":"user";stop(video);return start(video)}
export function hasCamera(){return Boolean(navigator.mediaDevices?.getUserMedia)}
