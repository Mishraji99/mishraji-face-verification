const WAIT_TIMEOUT_MS = 12000;

function waitForVideoReady(video) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
      video.removeEventListener("emptied", onEmptied);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The browser could not initialize the camera preview."));
    };
    const onEmptied = () => {
      cleanup();
      reject(Object.assign(new Error("Camera operation was canceled."), { name: "AbortError" }));
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.addEventListener("emptied", onEmptied, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("The camera did not provide video metadata in time."));
    }, WAIT_TIMEOUT_MS);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth) onReady();
  });
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: "Camera permission was denied. Allow camera access in your browser settings and try again.",
    PermissionDeniedError: "Camera permission was denied. Allow camera access in your browser settings and try again.",
    NotFoundError: "No available camera was found. Connect a camera and try again.",
    DevicesNotFoundError: "No available camera was found. Connect a camera and try again.",
    NotReadableError: "The camera is busy or could not be read. Close other apps using it and try again.",
    TrackStartError: "The camera is busy or could not start. Close other apps using it and try again.",
    OverconstrainedError: "That camera does not support the requested settings. Choose another camera.",
    SecurityError: "Camera access requires HTTPS or localhost in a supported browser.",
    AbortError: "The camera operation was interrupted. Try starting it again."
  };
  return messages[error?.name] || error?.message || "The camera could not be started.";
}

export class CameraManager {
  constructor(video, callbacks = {}) {
    this.video = video;
    this.onLost = callbacks.onLost || (() => {});
    this.stream = null;
    this.facingMode = "user";
    this.mobile = false;
    this.startPromise = null;
    this.operationGeneration = 0;
    this.selectedDeviceId = "";
    this.deviceChangeHandler = () => callbacks.onDevicesChanged?.();
    navigator.mediaDevices?.addEventListener?.("devicechange", this.deviceChangeHandler);
  }

  get isRunning() {
    return Boolean(this.stream?.getVideoTracks().some(track => track.readyState === "live"));
  }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === "videoinput");
  }

  start(options = {}) {
    if (this.startPromise) {
      return Promise.reject(new Error("A camera change is already in progress. Try again in a moment."));
    }
    const generation = ++this.operationGeneration;
    const operation = this.open(options, generation);
    this.startPromise = operation.finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async open(options = {}, generation) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(window.isSecureContext ? "This browser does not support camera access." : "Camera access requires HTTPS or localhost.");
    }

    await this.stop({ invalidate: false });
    if (generation !== this.operationGeneration) {
      throw Object.assign(new Error("Camera operation was canceled."), { name: "AbortError" });
    }
    this.mobile = options.mobile ?? this.mobile;
    const deviceId = options.deviceId ?? this.selectedDeviceId;
    const cameraConstraints = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : {
          ...(this.mobile ? { facingMode: { ideal: this.facingMode } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
    let stream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: cameraConstraints });
      } catch (firstError) {
        if (firstError?.name === "NotAllowedError" || firstError?.name === "NotFoundError") throw firstError;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : true });
      }

      if (generation !== this.operationGeneration) throw Object.assign(new Error("Camera operation was canceled."), { name: "AbortError" });
      const metadataReady = waitForVideoReady(this.video);
      this.video.srcObject = stream;
      await metadataReady;
      if (generation !== this.operationGeneration) throw Object.assign(new Error("Camera operation was canceled."), { name: "AbortError" });
      await this.video.play();
      if (generation !== this.operationGeneration) throw Object.assign(new Error("Camera operation was canceled."), { name: "AbortError" });
      this.stream = stream;
      this.video.parentElement?.style.setProperty("--camera-aspect", `${this.video.videoWidth} / ${this.video.videoHeight}`);
      const track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", () => {
        if (this.stream !== stream) return;
        this.stream = null;
        this.video.srcObject = null;
        this.onLost("Camera disconnected. Start a camera again to continue.");
      }, { once: true });
      return stream;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (this.video.srcObject === stream) this.video.srcObject = null;
      this.stream = null;
      throw error;
    }
  }

  async select(deviceId) {
    this.selectedDeviceId = deviceId;
    if (this.isRunning) return this.start({ deviceId });
    return null;
  }

  async switchFacing() {
    if (!this.mobile) throw new Error("Front and back camera switching is only available on mobile devices.");
    this.selectedDeviceId = "";
    this.facingMode = this.facingMode === "user" ? "environment" : "user";
    if (this.isRunning) return this.start({ mobile: this.mobile });
    return null;
  }

  async stop({ invalidate = true } = {}) {
    if (invalidate) this.operationGeneration++;
    const stream = this.stream || this.video.srcObject;
    if (stream?.getTracks) stream.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.video.parentElement?.style.removeProperty("--camera-aspect");
  }

  destroy() {
    void this.stop();
    navigator.mediaDevices?.removeEventListener?.("devicechange", this.deviceChangeHandler);
  }
}
