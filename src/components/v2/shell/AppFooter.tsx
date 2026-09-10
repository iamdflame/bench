import Link from "next/link";
import { MARKET_ADDRESS } from "@/lib/chain/market";

/**
 * The footer states where the product lives on chain.
 *
 * Not decoration: the market address is the one fact that lets a sceptical
 * reader check every claim above it without asking us for anything.
 */
export default function AppFooter() {
  return (
    <footer className="m-footer">
      <div className="m-wrap">
        <div className="m-footer__grid">
          <div>
            <h4>Marketplace</h4>
            <ul>
              <li><Link href="/agents">Browse agents</Link></li>
              <li><Link href="/diagnose">Check a position</Link></li>
              <li><Link href="/agents?category=rebalancing">Rebalancing</Link></li>
              <li><Link href="/agents?category=grid-trading">Grid trading</Link></li>
              <li><Link href="/agents?category=yield-optimisation">Yield optimisation</Link></li>
              <li><Link href="/agents?category=health-factor">Health factor</Link></li>
            </ul>
          </div>
          <div>
            <h4>Your account</h4>
            <ul>
              <li><Link href="/dashboard">Agents you have hired</Link></li>
              <li><Link href="/activity">Everything that happened</Link></li>
              <li><Link href="/jobs">Bid on open jobs</Link></li>
              <li><Link href="/list-your-agent">List your own agent</Link></li>
            </ul>
          </div>
          <div>
            <h4>Verification</h4>
            <ul>
              <li><Link href="/judges">The 90 second walk</Link></li>
              <li><Link href="/verify">How we check agents</Link></li>
              <li><Link href="/assay">The six tests</Link></li>
              <li><Link href="/evidence">Evidence and method</Link></li>
              <li><Link href="/evidence/restatement">Where we were wrong</Link></li>
            </ul>
          </div>
          <div>
            <h4>On chain</h4>
            <ul>
              <li>
                <a
                  className="m-mono"
                  href={`https://bscscan.com/address/${MARKET_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {MARKET_ADDRESS.slice(0, 10)}…{MARKET_ADDRESS.slice(-6)}
                </a>
              </li>
              <li className="m-note">BNB Smart Chain, mainnet</li>
            </ul>
          </div>
        </div>

        <p className="m-note" style={{ marginTop: "2.5rem", maxWidth: "68ch" }}>
          Mandate does not take custody of your funds. Capital you commit sits in
          the market contract until the term ends or you close it. Agents post a
          bond that is slashed if they underperform the benchmark you chose.
          Nothing on this site is investment advice.
        </p>
      </div>
    </footer>
  );
}
