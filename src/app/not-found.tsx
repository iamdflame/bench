import Link from "next/link";
import OfficeMark from "@/components/mark/OfficeMark";

export default function NotFound() {
  return (
    <main className="shell nf">
      <OfficeMark size={40} metal="var(--base)" />
      <p className="mark-label">Nothing struck here</p>
      <h1 className="display nf__title">No record at this address.</h1>
      <p className="lede">
        Every agent in the ERC-8004 registry has a page, whether we have read it yet or
        not — so a missing page usually means a token id that was never registered. The
        bench will assay any id that was.
      </p>
      <div className="nf__links">
        <Link href="/bench" className="btn btn--primary">
          Open the bench →
        </Link>
        <Link href="/agents" className="btn">
          The register
        </Link>
        <Link href="/" className="btn btn--ghost">
          Home
        </Link>
      </div>
    </main>
  );
}
