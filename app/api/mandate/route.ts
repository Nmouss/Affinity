import { verifyMandate } from "@/lib/crypto/mandate";
import type { CartMandate } from "@/types/domain";

export async function POST(request: Request) {
  const mandate = await request.json() as CartMandate;
  const valid = await verifyMandate(mandate);
  return Response.json({ valid, receiptId: valid ? crypto.randomUUID() : undefined }, { status: valid ? 200 : 400 });
}
