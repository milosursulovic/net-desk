// This Vitest+jsdom combo doesn't wire up window.localStorage at all (not
// even undefined-but-present - genuinely absent from window/globalThis),
// likely Node's own experimental native localStorage stepping on jsdom's
// implementation. A minimal in-memory polyfill here means every test file
// gets a working localStorage without each one having to mock it itself.
class LocalStorageMock {
  constructor() {
    this.store = new Map()
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }
  setItem(key, value) {
    this.store.set(key, String(value))
  }
  removeItem(key) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
  key(index) {
    return Array.from(this.store.keys())[index] ?? null
  }
  get length() {
    return this.store.size
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  const storage = new LocalStorageMock()
  globalThis.localStorage = storage
  if (typeof window !== 'undefined') window.localStorage = storage
}
