/** Khai báo kiểu tối thiểu cho bản browser của mammoth (không có @types riêng cho subpath này). */
declare module 'mammoth/mammoth.browser.js' {
  export type MammothResult = { value: string; messages: unknown[] };
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  const mammoth: { extractRawText: typeof extractRawText; convertToHtml: typeof convertToHtml };
  export default mammoth;
}
