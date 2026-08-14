// @react-native-async-storage/async-storage wraps a native module that
// doesn't exist in Jest's mocked native environment, so tests get a simple
// in-memory stand-in (same pattern as the other manual mocks in this folder).
const store = new Map();

module.exports = {
  getItem: async key => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => {
    store.set(key, value);
  },
  removeItem: async key => {
    store.delete(key);
  },
  getMany: async keys => {
    const result = {};
    keys.forEach(key => {
      result[key] = store.has(key) ? store.get(key) : null;
    });
    return result;
  },
  clear: async () => {
    store.clear();
  },
};
