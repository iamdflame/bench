import type { Metadata } from "next";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import TokenLookup from "@/components/ui/TokenLookup";
import Command from "@/components/ui/Command";
import Fineness from "@/components/mark/Fineness";
import OfficeMark from "@/components/mark/OfficeMark";
import { HALLMARK_LADDER } from "@/lib/assay/types";
import { MARKET_ADDRESS } from "@/lib/chain/market";

export const metadata: Metadata = {
  title: "The method — MANDATE",
  description:
    "The six tests, what each is worth, and the fineness ladder they produce. Assay any agent on BSC, including one you are being asked to trust somewhere else.",
};

/**
 * What each test is worth, in millesimal points.
 *
 * Published because a scoring rubric nobody can read is the same unaccountable
 * verdict as a five-star rating. The weights are the ones the code actually
 * uses — they are imported nowhere and stated here, so if they drift the page
 * is wrong and someone can say so.
 */
const TESTS: { id: string; title: string; weight: number; asks: string; fails: string }[] = [
  {
    id: "identity",
    title: "Identity",
    weight: 250,
    asks: "Does the thing the registry points at actually exist and answer?",
    fails: "Endpoint 404s · card unparseable · endpoint is an unsubstituted {agentId} template",
  },
  {
    id: "custody",
    title: "Custody",
    weight: 150,
    asks: "Is the agent's wallet separate from its owner's?",
    fails: "agent_wallet == owner_address — the agent has no custody of its own",
  },
  {
    id: "activity",
    title: "Activity",
    weight: 250,
    asks: "Has the wallet ever done anything?",
    fails: "nonce 0 · balance 0 — registered and never used",
  },
  {
    id: "capability",
    title: "Capability",
    weight: 200,
    asks: "Has it touched the protocols its claimed category implies?",
    fails: "A grid agent that has never called a router is claiming what the chain contradicts",
  },
  {
    id: "reputation",
    title: "Reputation",
    weight: 100,
    asks: "Does its feedback survive de-duplication?",
    fails: "Coordinated cohorts are removed before the mean is taken",
  },
  {
    id: "performance",
    title: "Performance",
    weight: 50,
    asks: "Has it settled epochs against measurements committed in advance?",
    fails: "No record — which is the ordinary case, and is reported as absence rather than zero",
  },
];

export default function MethodPage() {
  const total = TESTS.reduce((n, t) => n + t.weight, 0);

  return (
    <div className="app">
      <SiteHeader current="/assay" />

      <main className="shell method">
        {/*
          The method on the left, the instrument on the right.

          The heading, the lede and the lookup ran down a single narrow column
          — the median run of ink on this page reached 53% of the viewport. The
          page describes a test; the control that runs that test on any agent
          belongs beside the description of it, not underneath.
        */}
        <div className="band method__head">
          <div className="band__say">
            <div className="method__crest">
              <OfficeMark size={40} />
            </div>
            <p className="mark-label">The method</p>
            <h1 className="display method__title">
              We do not score agents. We test them, and publish what the test found.
            </h1>
            <p className="lede method__lede">
              Six tests against BNB Smart Chain, each worth a fixed number of millesimal
              points. An agent earns a point only where evidence exists — absence of
              evidence is impurity, because an assay office does not grade unproven
              metal. Nothing here is weighted by opinion after the fact.
            </p>
          </div>

          <div className="band__show method__try">
            <TokenLookup />
          </div>
        </div>

        <section className="section" aria-labelledby="tests-title">
          <div className="section__head">
            <h2 id="tests-title" className="section-title">
              The six tests
            </h2>
            <span className="mark-label">{total} points at a perfect score</span>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>test</th>
                  <th className="r">worth</th>
                  <th>what it asks</th>
                  <th>what a failure looks like</th>
                </tr>
              </thead>
              <tbody>
                {TESTS.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td className="r">{t.weight}</td>
                    <td className="method__wrap">{t.asks}</td>
                    <td className="method__wrap dim">{t.fails}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tbl__foot">
            A test that cannot produce evidence returns <em>inconclusive</em> rather than
            inventing a number. Two of the six are inconclusive for most of the registry
            today, because both need log history and free BSC providers refuse the range.
            That is stated on every certificate rather than smoothed into a score.
          </p>
        </section>

        <section className="section" aria-labelledby="ladder-title">
          <div className="section__head">
            <h2 id="ladder-title" className="section-title">
              The fineness ladder
            </h2>
            <span className="mark-label">millesimal, as the real system is</span>
          </div>
          <p className="section-sub">
            999 is pure. 375 is the lowest grade that may legally carry a hallmark in the
            United Kingdom, and it is the lowest grade that carries one here. The shield
            shape encodes the grade, so the mark is readable before the number is —
            and below 375 <strong>no shield is struck at all</strong>.
          </p>
          <ul className="grades">
            {HALLMARK_LADDER.map((h) => (
              <li className="grade" key={h.mark}>
                <Fineness fineness={h.min === 0 ? 0 : h.min} size={40} />
                <span className="grade__mark num">{h.mark}</span>
                <span className="grade__name">{h.name}</span>
                <span className="grade__note">{h.note}</span>
              </li>
            ))}
          </ul>
          <p className="tbl__foot">
            Base metal receives no mark. That is not an omission — it is the whole
            philosophy in one decision. A bad agent is never rendered with a bad score;
            it is rendered as an unmarked object, which is honest, unforgeable, and at
            the scale of this registry, unanswerable.
          </p>
        </section>

        <section className="section" aria-labelledby="run-title">
          <div className="section__head">
            <h2 id="run-title" className="section-title">
              Run it yourself
            </h2>
          </div>
          <div className="method__cmds">
            <Command note="The same six tests this site runs, from a clean checkout.">
              npm run assay -- 153776
            </Command>
            <Command note="The reputation autopsy for one agent, including the wallets behind it.">
              npm run sybil -- 153776
            </Command>
            <Command note="Re-derives a settlement from public chain state alone.">
              npx mandate-verify --mandate 0 --chain 56 --deployment v1
            </Command>
          </div>
          <p className="tbl__foot">
            Prefer to watch it happen? <a className="link-underline" href="/bench">The bench</a>{" "}
            streams an assay live, test by test, as the chain answers.
          </p>
        </section>
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note="Weights are fixed before a test runs and are not adjusted afterwards. Where a check cannot produce evidence it returns inconclusive, never a zero dressed as a finding."
      />
    </div>
  );
}
