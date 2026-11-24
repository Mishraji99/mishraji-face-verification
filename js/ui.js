export const $=id=>document.getElementById(id);
export function status(message,progress){$("status").textContent=message;if(progress!==undefined)$("progressBar").style.width=`${progress}%`}
export function beep(enabled){if(!enabled)return;const ctx=new AudioContext(),osc=ctx.createOscillator();osc.frequency.value=660;osc.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.08)}
export function sessionId(){const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase()}
