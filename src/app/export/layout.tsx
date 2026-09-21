// PDF-export pages always print ink-on-paper: this scope re-declares the
// theme tokens to the light palette (see .print-light in modernist.css),
// so the dark app theme never bleeds into a customer-facing report.
export default function ExportLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-light min-h-screen">{children}</div>;
}
