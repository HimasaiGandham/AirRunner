/**
 * Minimal browser-environment stubs so the real game modules (which touch
 * localStorage, window, canvas and requestAnimationFrame) can be imported and
 * driven headlessly under `node --test`.
 */

class StubContext2D {
  constructor() {
    this.calls = 0;
  }
  save() {}
  restore() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  arcTo() {}
  rect() {}
  roundRect() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  fill() {}
  stroke() {}
  fillRect() {}
  clearRect() {}
  strokeRect() {}
  fillText() {}
  setTransform() {}
  resetTransform() {}
  translate() {}
  rotate() {}
  scale() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
}

export function installDomStubs() {
  const store = new Map();

  const localStorageStub = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  const canvas = {
    width: 1280,
    height: 720,
    getContext: () => new StubContext2D(),
    parentElement: {
      getBoundingClientRect: () => ({ width: 1280, height: 720 })
    },
    addEventListener() {},
    removeEventListener() {}
  };

  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => canvas,
    addEventListener() {}
  };

  const listeners = new Map();

  globalThis.localStorage = localStorageStub;
  globalThis.document = doc;
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    AudioContext: undefined,
    webkitAudioContext: undefined
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.fetch = async () => {
    throw new Error('network disabled in tests');
  };

  return { store, canvas, doc };
}
