"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Assay any agent on BSC, including one you are being asked to trust
 * somewhere else.
 *
 * No wallet, no account, no permission from us. That framing matters more than
 * the control does: an assay office that only tested its own members would be
 * a trade association.
 */
export default function TokenLookup({
  label = "Assay any agent",
  cta = "Assay →",
}: {
  label?: string;
  cta?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const id = value.trim().replace(/^#/, "");
    if (!/^\d+$/.test(id)) return;
    router.push(`/agent/${id}`);
  };

  return (
    <form className="lookup" onSubmit={go}>
      <label className="mark-label" htmlFor="lookup-input">
        {label}
      </label>
      <div className="lookup__row">
        <input
          id="lookup-input"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ERC-8004 token id"
          aria-label="ERC-8004 token id"
        />
        <button type="submit" className="btn btn--primary" disabled={!/^\d+$/.test(value.trim())}>
          {cta}
        </button>
      </div>
      <p className="mark-label lookup__note">
        Six tests run against BNB Smart Chain while you watch. No wallet required.
      </p>
    </form>
  );
}
