import { expect, test } from "bun:test";
import { fetchPalette } from "./store";

test("fetchPalette: nouveau logo -> nouveau décodage", async () => {
  const loaded: string[] = [];
  class FakeImage {
    onerror: () => void = () => {};
    set src(value: string) {
      loaded.push(value);
      queueMicrotask(() => this.onerror());
    }
  }
  Object.assign(globalThis, { Image: FakeImage });
  await fetchPalette(7, "https://a/logo.png");
  await fetchPalette(7, "https://a/logo.png");
  expect(loaded).toHaveLength(1);
  await fetchPalette(7, "https://b/logo.png");
  expect(loaded).toHaveLength(2);
});

test("fetchPalette: entreprise sans logo -> aucune requête", async () => {
  const loaded: string[] = [];
  Object.assign(globalThis, {
    Image: class {
      set src(value: string) {
        loaded.push(value);
      }
    },
  });
  expect(await fetchPalette(8, "")).toEqual([]);
  expect(loaded).toHaveLength(0);
});
