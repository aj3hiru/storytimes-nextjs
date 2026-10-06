/**
 * XMLHttpRequest wrapper: unlike fetch it reports upload progress, and it
 * hands over streamed text as it arrives (for NDJSON progress feeds).
 */
export interface XhrOptions {
  method?: string;
  body?: XMLHttpRequestBodyInit | null;
  responseType?: "" | "blob" | "text";
  onUpload?: (loaded: number, total: number) => void;
  onHeaders?: (xhr: XMLHttpRequest) => void;
  onDownload?: (loaded: number, total: number) => void;
  onText?: (fullTextSoFar: string) => void;
}

export function xhrRequest(url: string, opts: XhrOptions = {}): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method ?? "GET", url);
    if (opts.responseType) xhr.responseType = opts.responseType;
    if (opts.onUpload) xhr.upload.onprogress = (e) => opts.onUpload!(e.loaded, e.lengthComputable ? e.total : 0);
    let headersSeen = false;
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2 && !headersSeen) {
        headersSeen = true;
        opts.onHeaders?.(xhr);
      }
    };
    xhr.onprogress = (e) => {
      opts.onDownload?.(e.loaded, e.lengthComputable ? e.total : 0);
      if (opts.onText && (xhr.responseType === "" || xhr.responseType === "text")) opts.onText(xhr.responseText);
    };
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again."));
    xhr.onabort = () => reject(new Error("Cancelled."));
    xhr.send(opts.body ?? null);
  });
}

/** Reads an error message out of a failed JSON (or Blob) response. */
export async function xhrError(xhr: XMLHttpRequest, fallback: string): Promise<string> {
  try {
    const text = xhr.response instanceof Blob ? await xhr.response.text() : xhr.responseText;
    return JSON.parse(text).message || fallback;
  } catch {
    if (xhr.status === 413) return "The file is too large for the server to accept.";
    return fallback;
  }
}
