export async function GET() {
  try {
    const flaskUrl = "http://localhost:9000/api/stream?XTransformPort=9000";
    const res = await fetch(flaskUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/event-stream",
        Connection: "keep-alive",
      },
    });
    if (!res.ok || !res.body) throw new Error("Flask not available");

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          // Connection closed
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("data: {\"mock\":true}\n\n", {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }
}
