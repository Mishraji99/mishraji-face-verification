const LIBRARY_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api@1.7.12/dist/face-api.js"
];
const MODEL_BASES = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/",
  "https://unpkg.com/@vladmandic/face-api@1.7.12/model/"
];
let libraryPromise;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Recognition library download failed."));
    };
    document.head.appendChild(script);
  });
}

async function loadLibrary() {
  if (window.faceapi) return window.faceapi;
  if (!libraryPromise) {
    libraryPromise = (async () => {
      let lastError;
      for (const url of LIBRARY_URLS) {
        try {
          await loadScript(url);
          if (window.faceapi) return window.faceapi;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("The face recognition library is unavailable.");
    })();
  }
  return libraryPromise;
}

export class FaceDetection {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.faceapi = null;
  }

  async load() {
    this.onStatus("loading", "Loading recognition library…");
    this.faceapi = await loadLibrary();
    this.onStatus("ready", "Recognition library loaded.");

    const networks = [
      ["tinyFaceDetector", this.faceapi.nets.tinyFaceDetector],
      ["faceLandmark68Net", this.faceapi.nets.faceLandmark68Net],
      ["faceRecognitionNet", this.faceapi.nets.faceRecognitionNet]
    ];
    for (const [name, network] of networks) {
      this.onStatus("loading", `Loading ${name === "tinyFaceDetector" ? "face detection" : name === "faceLandmark68Net" ? "landmark" : "recognition"} model…`);
      if (network.isLoaded) continue;
      let loaded = false;
      let lastError;
      for (const base of MODEL_BASES) {
        try {
          await network.loadFromUri(base);
          loaded = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!loaded) throw new Error(`Face model download failed (${name}). Check your connection and reload.`);
      if (lastError) this.onStatus("ready", `${name} loaded using the alternate model source.`);
    }
    this.onStatus("ready", "Recognition library and models are ready.");
  }

  async detectOne(input) {
    if (!this.faceapi) throw new Error("Face recognition resources are not loaded.");
    try {
      const options = new this.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
      const detections = await this.faceapi.detectAllFaces(input, options).withFaceLandmarks().withFaceDescriptors();
      if (detections.length === 0) throw new Error("No face detected. Use a clearer image and try again.");
      if (detections.length > 1) throw new Error("Multiple faces detected. Use an image containing one face.");
      return { descriptor: detections[0].descriptor, box: detections[0].detection.box };
    } catch (error) {
      if (error instanceof Error && /No face detected|Multiple faces detected/.test(error.message)) throw error;
      throw new Error("Face detection failed. Try a clearer image or restart the comparison.");
    }
  }

  distance(first, second) {
    return this.faceapi.euclideanDistance(first, second);
  }
}
