/** Réseau de mentors : matching par secteur et compétences, demande de mise en relation soumise à approbation. */
import { proposeExternalMessage } from "@/lib/workspace/actions";
import { WorkspaceError } from "@/lib/workspace/service";
import { newId, nowIso } from "@/lib/workspace/store";
import { SEED_MENTORS, type Mentor } from "./mentors";
import { readModule, withModule } from "./store";
import { SKILL_DOMAINS, skillGaps } from "./scoring";
import { guardRecipient, hasKeyword } from "./util";

export function scoreMentor(mentor: Mentor, sectorText: string, skills: string[]) {
  const sectorHits = mentor.sectors.filter((s) => s !== "tous secteurs" && hasKeyword(sectorText, s));
  const generalist = mentor.sectors.includes("tous secteurs");
  const skillHits = mentor.skills.filter((s) => skills.some((k) => hasKeyword(s, k) || hasKeyword(k, s)));
  const score = Math.min(100, sectorHits.length * 20 + (generalist ? 10 : 0) + skillHits.length * 15);
  return { score, sectorHits, skillHits };
}

export async function matchMentors(companyId: string, opts: { skills?: string[]; sector?: string } = {}) {
  const { company, m, data } = await readModule(companyId);
  const members = data.members.filter((x) => x.companyId === companyId);
  const gaps = skillGaps(company, members, m.memberSkills.filter((s) => s.companyId === companyId));
  const gapSkills = gaps.gaps.flatMap((g) => [g.label, ...(SKILL_DOMAINS.find((d) => d.id === g.domain)?.keywords.slice(0, 4) ?? [])]);
  const skills = opts.skills?.length ? opts.skills : gapSkills;
  const sectorText = `${opts.sector ?? ""} ${company.sector} ${company.sectorKeywords.join(" ")} ${company.description}`;
  const rows = SEED_MENTORS.map((mentor) => ({ mentor, ...scoreMentor(mentor, sectorText, skills) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return { skillsSought: skills, rows, requests: m.mentorRequests.filter((r) => r.companyId === companyId) };
}

export async function requestIntro(companyId: string, input: { mentorId: string; message?: string; senderName?: string }, actor = "agent") {
  const mentor = SEED_MENTORS.find((x) => x.id === input.mentorId);
  if (!mentor) throw new WorkspaceError("Mentor introuvable.", 404);
  const { company, data, m } = await readModule(companyId);
  if (m.mentorRequests.some((r) => r.companyId === companyId && r.mentorId === mentor.id && data.approvals.find((a) => a.id === r.approvalId)?.status === "en_attente")) {
    throw new WorkspaceError("Une demande à ce mentor attend déjà votre validation.", 409);
  }
  const owner = data.members.find((x) => x.companyId === companyId && x.role === "proprietaire");
  const name = company.name.replace(" (démo)", "");
  const message = input.message?.trim() || `Nous développons ${name} (${company.sector}, ${company.city}). Votre expérience (${mentor.headline.toLowerCase()}) nous serait précieuse, notamment sur : ${mentor.skills.slice(0, 3).join(", ")}.`;
  const body = `Bonjour ${mentor.name.replace(" (exemple)", "")},\n\n${message}\n\nAccepteriez-vous un premier échange de 30 minutes, au moment qui vous convient ?\n\nMerci d'avance,\n${input.senderName || owner?.name || "Le fondateur"}\n${name}`;
  const dest = guardRecipient(mentor.email, `mentor-${mentor.id}`);
  const { email, approval } = await proposeExternalMessage(
    companyId,
    { module: "mentor", type: "mentor_mise_en_relation", title: `Mise en relation avec ${mentor.name}`, summary: `Demande de mentorat pour ${name} (${mentor.headline}).`, channel: "email", to: [dest.to], subject: `Demande de mentorat — ${name}`, body, relatedType: "mentor", relatedId: mentor.id, legalQuery: "données à caractère personnel consentement prospection communication électronique" },
    actor,
  );
  const req = await withModule(companyId, (mod) => {
    const r = { id: newId("mreq"), companyId, mentorId: mentor.id, mentorName: mentor.name, message, emailId: email.id, approvalId: approval.id, createdAt: nowIso() };
    mod.mentorRequests.push(r);
    return r;
  });
  return { request: req, approvalId: approval.id, emailId: email.id, mentorIsExample: mentor.isExample };
}
