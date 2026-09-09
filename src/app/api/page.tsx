import type { Metadata } from "next";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Command from "@/components/ui/Command";
import { MARKET_ADDRESS } from "@/lib/chain/market";

export const metadata: Metadata = {
  title: "The assay, as public infrastructure — MANDATE",
  description:
    "A free, unauthenticated, rate-limited API over the assay engine. Assay any ERC-8004 agent on BNB Smart Chain, read the trust ladder, browse the register. Open to everyone, including the projects competing with us.",
};

const HOST = "https://mandate-coral.vercel.app";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/assay/56/{tokenId}",
    limit: "10 / minute",
    what: "Six tests against BNB Smart Chain, with every finding and its evidence. Several seconds of real work, which is why the limit is tightest here.",
    example: `curl ${HOST}/api/v1/assay/56/2410`,
  },
  {
    method: "GET",
    path: "/api/v1/registry/funnel",
    limit: "60 / minute",
    what: "The trust ladder: every rung, the test that settles it, its population, and the command that re-derives it. A rung that cannot be measured returns null.",
    example: `curl ${HOST}/api/v1/registry/funnel`,
  },
  {
    method: "GET",
    path: "/api/v1/agents?rung=&category=&limit=&offset=",
    limit: "30 / minute",
    what: "The register, filterable. Carries coverage, so a small answer can always be told apart from a small registry.",
    example: `curl "${HOST}/api/v1/agents?rung=2&limit=5"`,
  },
];

export default function ApiPage() {
  return (
    <div className="app">
      <SiteHeader />

      <main className="shell method">
        <p className="mark-label">Public infrastructure</p>
        <h1 className="display method__title">The assay is open to everyone.</h1>
        <p className="lede method__lede">
          Free, unauthenticated, rate limited. No key, no account, no permission from us —
          including for the other projects in this hackathon. An assay office whose
          findings only its own front end could read would be a trade association, and a
          measurement nobody else can obtain is indistinguishable from one nobody else can
          falsify.
        </p>

        <section className="section" aria-labelledby="ep">
          <div className="section__head">
            <h2 id="ep" className="section-title">
              Three endpoints
            </h2>
            <span className="mark-label">CORS open · JSON · no auth</span>
          </div>

          <div className="api__list">
            {ENDPOINTS.map((e) => (
              <article className="panel api__ep" key={e.path}>
                <div className="panel__head">
                  <h3 className="mark-label">
                    {e.method} <span className="api__path">{e.path}</span>
                  </h3>
                  <span className="mark-label">{e.limit}</span>
                </div>
                <div className="panel__body">
                  <p className="small api__what">{e.what}</p>
                  <Command>{e.example}</Command>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="guar">
          <div className="section__head">
            <h2 id="guar" className="section-title">
              What every answer guarantees
            </h2>
          </div>
          <ul className="grades api__guarantees">
            <li className="grade">
              <span className="grade__mark num">observed</span>
              <span className="grade__name">Every response carries its boundary</span>
              <span className="grade__note">
                The block it was read at and when, on every payload. A number without its
                observation boundary is a claim, and this API does not serve claims.
              </span>
            </li>
            <li className="grade">
              <span className="grade__mark num">null</span>
              <span className="grade__name">Unmeasurable is null, never a guess</span>
              <span className="grade__note">
                Rung 3 needs a log scan per agent that no free provider will serve at
                registry scale. Its population is null and its method says why.
              </span>
            </li>
            <li className="grade">
              <span className="grade__mark num">coverage</span>
              <span className="grade__name">A small answer is not a small registry</span>
              <span className="grade__note">
                `read` is how many agents have actually been fetched and parsed. `unread`
                is the rest. You can always tell the two apart.
              </span>
            </li>
            <li className="grade">
              <span className="grade__mark num">reproduce</span>
              <span className="grade__name">Every assay ships its own check</span>
              <span className="grade__note">
                A shell line that re-runs the same six tests from a clean checkout of the
                source, against the same chain.
              </span>
            </li>
          </ul>
        </section>

        <section className="section" aria-labelledby="npm">
          <div className="section__head">
            <h2 id="npm" className="section-title">
              A client, if you want one
            </h2>
          </div>
          <div className="method__cmds">
            <Command note="Typed, dependency-free, works anywhere fetch does.">
              npm i mandate-client
            </Command>
          </div>
          <pre className="api__code">
            <code>{`import { Mandate } from "mandate-client";

const mandate = new Mandate();

const assay = await mandate.assay(2410);
console.log(assay.fineness, assay.hallmarked, assay.observed.blockNumber);

const page = await mandate.agents({ rung: 2, limit: 20 });
console.log(\`\${page.coverage.read} of \${page.coverage.registered} read\`);`}</code>
          </pre>
        </section>

        <section className="section" aria-labelledby="inv">
          <div className="section__head">
            <h2 id="inv" className="section-title">
              An invitation, meant literally
            </h2>
          </div>
          <p className="section-sub api__invite">
            If you are building an agent marketplace, a directory, a router or a wallet on
            BNB Smart Chain, this is yours to use. Show fineness on your own listings. Use
            the ladder as your own filter. Cite the assay and disagree with it in public —
            every finding carries the command that re-derives it, so disagreeing is cheap
            and settling the disagreement is cheaper. You do not need to ask, and there is
            nothing to sign.
          </p>
        </section>
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note="Rate limits are returned on every response as x-ratelimit-* headers. Exceeding one returns 429 with retry-after in seconds."
      />
    </div>
  );
}
