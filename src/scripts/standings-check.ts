import { readStandings } from "@/lib/chain/standings";
const r = await readStandings();
console.log(`blocks ${r.fromBlock}..${r.toBlock}  complete=${r.complete}`);
console.log("");
console.log("agent          held  epochs   mean   wins   fees(BNB)  slashed(BNB)  fired");
for (const s of r.standings) {
  const bnb = (w: string) => (Number(BigInt(w)) / 1e18).toFixed(3);
  console.log(
    `${s.agent.slice(0, 12)}  ${String(s.mandatesHeld).padStart(4)}  ${String(s.epochs).padStart(6)}  ` +
    `${(s.meanAlphaBps / 100).toFixed(2).padStart(6)}%  ${String(s.wins).padStart(4)}  ` +
    `${bnb(s.feesWei).padStart(9)}  ${bnb(s.slashedWei).padStart(12)}  ${String(s.dismissals).padStart(5)}`,
  );
}
