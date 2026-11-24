import {start,stop,switchCamera,getStream,hasCamera} from "./camera.js";
import {loadModels,descriptor,distance} from "./face-detection.js";
import {$,status,beep,sessionId} from "./ui.js";
let reference=null,scanning=false,sound=false,threshold=.5,installPrompt=null;
const camera=$("camera");
function update(){const ready=Boolean(reference&&getStream()&&!scanning);$("scanButton").disabled=!ready;$("switchCamera").disabled=!Boolean(getStream());$("stopCamera").disabled=!Boolean(getStream())}
function setCameraStatus(text){$("cameraStatus").textContent=text}
async function diagnostics(){ $("browserInfo").textContent=/Edg/.test(navigator.userAgent)?"Microsoft Edge":/Chrome/.test(navigator.userAgent)?"Google Chrome":"Other browser";$("secureInfo").textContent=window.isSecureContext?"Ready":"HTTPS required";$("deviceInfo").textContent=hasCamera()?"Available":"Unavailable";try{$("deviceInfo").textContent=`${(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput").length} available`}catch{}}
async function boot(){try{await loadModels((message,progress)=>{status(message,progress)});$("modelStatus").textContent="READY";$("modelInfo").textContent="Ready"}catch(error){$("modelStatus").textContent="ERROR";$("modelInfo").textContent="Unavailable";status(`System error: ${error.message}`)}await diagnostics()}
 $("photoInput").addEventListener("change",event=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith("image/")){status("Please select an image file.");return}const url=URL.createObjectURL(file),image=$("photoPreview");image.onload=()=>{reference=image;image.classList.add("visible");$("photoStatus").textContent="Photo ready for local analysis.";URL.revokeObjectURL(url);update()};image.onerror=()=>{URL.revokeObjectURL(url);status("Unable to read this image. Try another one.")};image.src=url});
 $("clearPhoto").onclick=()=>{$("photoInput").value="";reference=null;$("photoPreview").classList.remove("visible");$("photoStatus").textContent="No reference photo selected.";update()};
 $("startCamera").onclick=async()=>{try{status("Requesting camera permission…");await start(camera);setCameraStatus("ONLINE");$("cameraMessage").textContent="Camera ready. Align one face inside the guide.";update()}catch(error){setCameraStatus("ERROR");$("cameraMessage").textContent=error.message;$("startCamera").disabled=false;status(`Camera error: ${error.message}`)}};
 $("switchCamera").onclick=async()=>{try{await switchCamera(camera);setCameraStatus("ONLINE")}catch(error){status(`Camera switch failed: ${error.message}`)}};
 $("stopCamera").onclick=()=>{stop(camera);setCameraStatus("OFFLINE");$("cameraMessage").textContent="Camera stopped.";update()};
 $("scanButton").onclick=async()=>{if(scanning)return;scanning=true;update();$("camera-frame")?.classList.add("scanning");$("camera").parentElement.classList.add("scanning");$("result").hidden=true;try{status("1/4 — Scanning reference photo…",15);const ref=await descriptor(reference);status("2/4 — Scanning live camera…",45);const live=await descriptor(camera);status("3/4 — Comparing face features…",75);const d=distance(ref,live),matched=d<=threshold,now=new Date(),id=sessionId();$("result").hidden=false;$("resultBadge").textContent=matched?"MATCH · DEMO":"NO MATCH · DEMO";$("resultTitle").textContent=matched?"Faces appear to match":"Faces did not match";$("resultMessage").textContent=matched?"This comparison is a demonstration only, not proof of identity.":"Try clearer, evenly lit images with one face.";$("distance").textContent=d.toFixed(4);$("threshold").textContent=threshold.toFixed(2);$("resultTime").textContent=now.toLocaleString();$("sessionId").textContent=id;status("4/4 — Demonstration completed.",100);beep(sound);window.lastReport={matched,distance:d,threshold,time:now.toISOString(),sessionId:id}}catch(error){status(error.message);$("result").hidden=true}finally{scanning=false;$("camera").parentElement.classList.remove("scanning");update()}};
 $("scanAgain").onclick=()=>{$("result").hidden=true;status("Ready for another demonstration scan.",0);update()};
 $("copyButton").onclick=async()=>{try{await navigator.clipboard.writeText($("sessionId").textContent);status("Session ID copied.")}catch{status("Copy unavailable in this browser.")}};
 $("exportButton").onclick=()=>{if(!window.lastReport)return;const blob=new Blob([JSON.stringify({notice:"Demonstration only; not identity proof.",...window.lastReport},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`mishraji-demo-${window.lastReport.sessionId}.json`;a.click();URL.revokeObjectURL(a.href)};
 $("clearSession").onclick=()=>{$("clearPhoto").click();$("stopCamera").click();$("result").hidden=true;status("Session cleared. Images and descriptors were discarded.",0)};
 $("thresholdInput").oninput=event=>{threshold=Number(event.target.value);$("thresholdOutput").textContent=threshold.toFixed(2);$("threshold").textContent=threshold.toFixed(2)};
 $("themeToggle").onclick=()=>document.body.classList.toggle("light");
 $("soundButton").onclick=event=>{sound=!sound;event.currentTarget.textContent=sound?"🔊 Sound on":"🔇 Sound off";event.currentTarget.setAttribute("aria-pressed",sound)};
 $("fullscreenButton").onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.()};
 $("refreshDiagnostics").onclick=diagnostics;
 window.addEventListener("beforeunload",()=>stop(camera));
 window.addEventListener("appinstalled",()=>{$("installButton").hidden=true});
 window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("installButton").hidden=false});
 $("installButton").onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("installButton").hidden=true}};
 if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
 boot();
