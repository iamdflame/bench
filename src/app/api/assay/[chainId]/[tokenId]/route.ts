/**
 * Streams a live assay.
 *
 * Server-sent events rather than a single JSON response, because the point of
 * the bench is watching the evidence arrive. Each test emits as it resolves,
 * so the page shows the chain answering in real time rather than a spinner
 * followed by a verdict.
 */

import { assayAgent } from "@/lib/assay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chainId: string; tokenId: string }> },
) {
  const { chainId: rawChain, tokenId } = await params;
  const chainId = Number(rawChain);

  if (!Number.isFinite(chainId) || !/^\d{1,20}$/.test(tokenId)) {
    return new Response(JSON.stringify({ error: "bad agent id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const started = Date.now();
      send("open", { chainId, tokenId, at: new Date().toISOString() });

      try {
        const report = await assayAgent(
          chainId,
          tokenId,
          (ev) => {
            send("progress", {
              stage: ev.stage,
              index: ev.index,
              total: ev.total,
              result: ev.result ?? null,
              elapsed: Date.now() - started,
            });
          },
          // Somebody is watching this one. Twelve seconds, then say so.
          { registryDeadlineMs: 12_000 },
        );
        send("report", report);
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        send("done", { ms: Date.now() - started });
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client disconnecting */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
