import { parseSiteSevenTableImageData } from "./siteSevenImageOcr";

self.onmessage = (event) => {
  const { id, image, options } = event.data || {};
  try {
    const result = parseSiteSevenTableImageData({
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.buffer),
    }, options);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : "写真の読み取りに失敗しました",
    });
  }
};
