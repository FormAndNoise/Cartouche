/**
 * Blob/File reading helpers that work in browsers and jsdom (which lacks
 * Blob.text()/arrayBuffer() on older versions).
 */
export async function readBlobBytes(
  blob: Blob,
): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof blob.arrayBuffer === "function") {
    try {
      return new Uint8Array((await blob.arrayBuffer()) as ArrayBuffer);
    } catch {
      /* fall through to FileReader (jsdom) */
    }
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
    fr.onerror = () => reject(fr.error ?? new Error("blob read failed"));
    fr.readAsArrayBuffer(blob);
  });
}

export async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    try {
      return await blob.text();
    } catch {
      /* fall through */
    }
  }
  const bytes = await readBlobBytes(blob);
  return new TextDecoder().decode(bytes);
}
