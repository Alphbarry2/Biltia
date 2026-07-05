// Déclaration minimale pour html2pdf.js (pas de types officiels) — seule la
// chaîne worker utilisée par lib/pdf-share.ts est décrite.
declare module "html2pdf.js" {
  type Html2PdfWorker = {
    set(opts: Record<string, unknown>): Html2PdfWorker;
    from(el: HTMLElement): Html2PdfWorker;
    output(type: "blob"): Promise<Blob>;
    save(): Promise<void>;
  };
  const html2pdf: () => Html2PdfWorker;
  export default html2pdf;
}
