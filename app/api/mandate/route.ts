import { verifyMandate } from "@/lib/crypto/mandate";
import type { CartMandate } from "@/types/domain";

// Verifies the browser's signed approval proof. This is a check, not the approval path: approving
// resumes the Python thread through /api/council/resume, and only the backend can produce a receipt
// or merchant cart. Kept for the /lab diagnostics and tests of the signing round trip.

export async function POST(request: Request) {
  const mandate = (await request.json()) as CartMandate;
  const valid = await verifyMandate(mandate);
  return Response.json({ valid }, { status: valid ? 200 : 400 });
}
