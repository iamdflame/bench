import { redirect } from "next/navigation";

/** The floor moved to /floor when the ladder took the front door. */
export default function MarketPage() {
  redirect("/floor");
}
