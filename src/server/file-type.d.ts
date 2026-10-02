// The API emits CommonJS; file-type exposes its declarations through ESM exports.
// Keep the narrow signature used by the upload validator available to that build.
declare module "file-type" {
  export function fileTypeFromBuffer(
    bytes: Uint8Array,
  ): Promise<{ ext: string; mime: string } | undefined>;
}
