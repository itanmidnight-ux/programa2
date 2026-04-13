"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[UI Error Boundary]", error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
      <div className="max-w-xl w-full rounded-xl border border-red-500/30 bg-red-500/10 p-6">
        <h2 className="text-lg font-semibold text-red-300">Dashboard Error</h2>
        <p className="text-sm text-red-100/85 mt-2">
          Ocurrió un error de cliente al cargar la aplicación. Puedes reintentar sin reiniciar el servidor.
        </p>
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-md bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/30"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

