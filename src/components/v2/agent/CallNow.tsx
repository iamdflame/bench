import BuyOneCall from "@/components/v2/agent/BuyOneCall";
import { humanAmount, type Quote, type Preview } from "@/lib/x402/quote";

/**
 * Paying an agent for one answer, without committing capital.
 *
 * Two things had to be true before this could be honest. The price had to be
 * measured rather than declared, which it now is: the census asks every
 * endpoint that answers 402 what it charges and commits the reply. And the
 * button had to be able to actually settle, which depends on the agent
 * speaking a protocol we can sign.
 *
 * Where it does, the call runs end to end and the buyer needs no BNB. Where it
 * does not, this says exactly which part we cannot satisfy and links to the
 * endpoint so a person can pay it themselves. A button that fails when pressed
 * is worse than a sentence explaining why there is no button.
 */
export default function CallNow({
  tokenId,
  quote,
  preview,
}: {
  tokenId: string;
  quote: Quote | null;
  preview: Preview | null;
}) {
  const label = (q: Quote) =>
    `${humanAmount(q.amount, q.decimals)} ${
      q.assetName === "World Liberty Financial USD" ? "USD1" : (q.assetName ?? "")
    }`.trim();

  if (!quote) {
    return (
      <div className="m-panel m-panel--sunken" id="call">
        <p className="m-label">Paying per call</p>
        <p className="m-small" style={{ margin: "0.6rem 0 1rem" }}>
          This agent has never quoted us a price. You can still hire it under a
          mandate, where it is paid out of what it makes rather than per call.
        </p>
        <p className="m-note">
          We buy our own six checks over the same rail, which is the one paid call
          on this page that we can settle for you.
        </p>
        <div style={{ marginTop: "1rem" }}>
          <BuyOneCall
            path={`/api/x402/agent/${tokenId}/status`}
            what="The six checks on this agent, run live and settled on chain."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="m-panel" id="call" style={{ borderColor: "var(--ink)" }}>
      <p className="m-label">Call it now</p>
      <p className="m-callprice">{label(quote)}</p>
      <p className="m-note">a call, settled on {quote.network === "eip155:56" ? "BNB Smart Chain" : quote.network}</p>

      {quote.description ? (
        <p className="m-small" style={{ marginTop: "0.9rem" }}>
          {quote.description}
        </p>
      ) : null}

      {preview ? (
        <details className="m-disclose" style={{ marginTop: "0.9rem" }}>
          <summary>What it returns, before you pay</summary>
          <div className="m-disclose__body">
            <p className="m-small">
              {preview.agent ? <strong>{preview.agent}. </strong> : null}
              {preview.summary}
            </p>
            {preview.inputs.length ? (
              <>
                <p className="m-label" style={{ marginTop: "0.8rem" }}>
                  What you give it
                </p>
                <dl className="m-kv">
                  {preview.inputs.map((i) => (
                    <div key={i.name}>
                      <dt>{i.name}{i.required ? "" : " (optional)"}</dt>
                      <dd className="m-small">{i.description ?? ""}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            <p className="m-note" style={{ marginTop: "0.8rem" }}>
              This agent publishes a free preview of what a paid call returns. We
              did not write it and we did not pay for it.
            </p>
          </div>
        </details>
      ) : null}

      {quote.payable ? (
        <div style={{ marginTop: "1rem" }}>
          <BuyOneCall
            path={quote.endpoint}
            what={`One call against this agent, ${label(quote)}. You need no BNB: you sign, the seller pays the gas.`}
          />
        </div>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <p className="m-small">
            We cannot settle this one for you, because {quote.unpayable}.
          </p>
          <p className="m-note" style={{ marginTop: "0.5rem" }}>
            The price above is real and was read from the agent&rsquo;s own response
            just now. You can pay it directly at{" "}
            <a className="m-link m-mono" href={quote.endpoint} target="_blank" rel="noreferrer">
              {new URL(quote.endpoint).host}
            </a>.
          </p>
        </div>
      )}
    </div>
  );
}
