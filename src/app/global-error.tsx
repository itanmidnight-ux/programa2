"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[Global Error Boundary]", error);

  return (
    <html>
      <body style={{ margin: 0, background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 720, width: "100%", border: "1px solid rgba(239,68,68,.35)", background: "rgba(127,29,29,.35)", borderRadius: 12, padding: 24 }}>
            <h2 style={{ margin: 0, color: "#fca5a5" }}>Fatal Application Error</h2>
            <p style={{ color: "rgba(254,226,226,.9)", marginTop: 10 }}>
              Se produjo un error crítico del lado cliente. Reintenta la carga del dashboard.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 14,
                background: "rgba(239,68,68,.25)",
                border: "1px solid rgba(252,165,165,.5)",
                color: "#fecaca",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

