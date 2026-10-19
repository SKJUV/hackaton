import { assertCompanyAccess } from "@/lib/workspace/access";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { currentScore, issueAttestation, revokeAttestation } from "@/lib/modules/memoire/attestations";
import { actorName } from "@/lib/modules/memoire/overview";
import { METHODOLOGY } from "@/lib/modules/memoire/score";
import { assertMemoireAccess } from "@/lib/modules/memoire/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompanyAccess(companyId, viewer);
    return { ...(await currentScore(companyId)), methodology: METHODOLOGY };
  });
}

/** Émet une attestation signée (Ed25519) vérifiable sur /verifier/<id>. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const att = await issueAttestation(companyId, await actorName(companyId, s(b.memberId)));
    return { id: att.id, url: `/verifier/${att.id}`, payload: att.payload };
  });
}

/** Révoque une attestation (la page publique l'indiquera). */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return handlePaid(async (viewer) => {
    await assertMemoireAccess("attestations", id, viewer);
    const att = await revokeAttestation(id);
    return { id: att.id, revokedAt: att.revokedAt };
  });
}
