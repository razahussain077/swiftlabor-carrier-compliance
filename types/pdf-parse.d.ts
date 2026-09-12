declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    version: string;
    text: string;
  }

  type PDFParser = (dataBuffer: Buffer) => Promise<PDFData>;

  const pdf: PDFParser;
  export default pdf;
}
