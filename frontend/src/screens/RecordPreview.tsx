import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { api, download, fetchBlob } from "../api/client";
import type { CareRecordDetail } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { Icon } from "../components/Icons";
import { EmptyState, ErrorState, Loading } from "../components/bits";
import { mediumDate } from "../lib/format";
import { useMe } from "../lib/auth";

GlobalWorkerOptions.workerSrc = workerUrl;

type LoadingTask = ReturnType<typeof getDocument>;
type PdfDocument = Awaited<LoadingTask["promise"]>;

export default function RecordPreview() {
  const { id } = useParams();
  const { data: me } = useMe();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const printUrl = useRef<string | null>(null);
  const [current, setCurrent] = useState(1);

  const record = useQuery({
    queryKey: ["record", Number(id)],
    queryFn: () => api.get<CareRecordDetail>(`/records/${id}/`),
  });

  const pdf = useQuery({
    queryKey: ["record-pdf", Number(id)],
    queryFn: ({ signal }) => fetchBlob(`/records/${id}/pdf/?inline=1`, signal),
    enabled: !!record.data?.has_pdf,
    staleTime: Infinity,
  });

  useEffect(
    () => () => {
      if (printUrl.current) URL.revokeObjectURL(printUrl.current);
    },
    [],
  );

  if (!me) return null;

  const r = record.data;
  const pages = r?.document_pages ?? [];

  const print = () => {
    const frame = frameRef.current;
    if (!frame || !pdf.data) return;
    if (printUrl.current) {
      frame.contentWindow?.print();
      return;
    }
    printUrl.current = URL.createObjectURL(pdf.data);
    frame.onload = () => frame.contentWindow?.print();
    frame.src = printUrl.current;
  };

  return (
    <AppFrame
      me={me}
      title="Record PDF"
      back={{ to: r ? `/records/${r.id}` : "/", label: "Back to the record" }}
      actions={
        r?.has_pdf ? (
          <>
            <button type="button" className="c-btn c-btn--sm" onClick={print} disabled={!pdf.data}>
              <Icon name="print" className="c-btn__icon" />
              <span className="u-hide-sm">Print</span>
            </button>
            <button
              type="button"
              className="c-btn c-btn--sm c-btn--primary"
              onClick={() => download(`/records/${r.id}/pdf/`)}
            >
              <Icon name="download" className="c-btn__icon" />
              <span className="u-hide-sm">Download PDF</span>
            </button>
          </>
        ) : undefined
      }
    >
      {record.isPending && <Loading />}
      {record.isError && <ErrorState error={record.error} onRetry={() => record.refetch()} />}

      {r && (
        <>
          <div className="c-pagehead">
            <div>
              <h1 className="c-pagehead__title">
                {r.participant_name} · {mediumDate(r.service_date)} · {r.shift_label}
              </h1>
              <p className="c-pagehead__sub">
                Record {r.reference} · {pages.length} page{pages.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {!r.has_pdf && (
            <div className="c-panel">
              <EmptyState
                icon="file"
                title="No PDF yet"
                body="The PDF is made when the record is submitted."
              />
            </div>
          )}
          {pdf.isError && <ErrorState error={pdf.error} onRetry={() => pdf.refetch()} />}
          {r.has_pdf && !pdf.data && !pdf.isError && <Loading label="Opening the PDF" />}
          {pdf.data && (
            <PdfPages
              blob={pdf.data}
              labels={pages.map((page) => page.label)}
              current={current}
              onCurrent={setCurrent}
            />
          )}

          <iframe
            ref={frameRef}
            className="c-preview__frame"
            title="Print copy"
            aria-hidden="true"
            tabIndex={-1}
          />
        </>
      )}
    </AppFrame>
  );
}

function PdfPages({
  blob,
  labels,
  current,
  onCurrent,
}: {
  blob: Blob;
  labels: string[];
  current: number;
  onCurrent: (page: number) => void;
}) {
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: LoadingTask | null = null;

    blob
      .arrayBuffer()
      .then((data) => {
        if (cancelled) return null;
        task = getDocument({ data });
        return task.promise;
      })
      .then((opened) => {
        if (!cancelled && opened) setPdfDocument(opened);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);

  if (failed) {
    return <ErrorState error={new Error("This PDF could not be shown here. Download it instead.")} />;
  }
  if (!pdfDocument) return <Loading label="Opening the PDF" />;

  const numbers = Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1);
  const name = (number: number) => labels[number - 1] || `Page ${number}`;

  const jump = (number: number) => {
    onCurrent(number);
    document.getElementById(`pdf-page-${number}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="c-preview">
      <nav className="c-preview__thumbs" aria-label="Pages">
        {numbers.map((number) => (
          <button
            key={number}
            type="button"
            className="c-preview__thumb"
            aria-current={current === number ? "true" : undefined}
            onClick={() => jump(number)}
          >
            <PdfCanvas pdfDocument={pdfDocument} number={number} width={160} />
            <span>
              {number} · {name(number)}
            </span>
          </button>
        ))}
      </nav>

      <div className="c-preview__pages">
        {numbers.map((number) => (
          <div key={number} id={`pdf-page-${number}`} className="c-preview__page">
            <PdfCanvas
              pdfDocument={pdfDocument}
              number={number}
              width={900}
              label={`Page ${number}, ${name(number)}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PdfCanvas({
  pdfDocument,
  number,
  width,
  label,
}: {
  pdfDocument: PdfDocument;
  number: number;
  width: number;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    void pdfDocument.getPage(number).then((page) => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (width / page.getViewport({ scale: 1 }).width) * ratio;
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const task = page.render({ canvas, viewport });
      cancelRender = () => task.cancel();
      task.promise.catch(() => undefined);
    });

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [pdfDocument, number, width]);

  return label ? (
    <canvas ref={ref} role="img" aria-label={label} />
  ) : (
    <canvas ref={ref} aria-hidden="true" />
  );
}
