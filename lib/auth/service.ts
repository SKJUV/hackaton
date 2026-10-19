import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { getMailConfig, sendMail } from "@/lib/mail";
import { SEED_USERS } from "@/lib/workspace/seed";
import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import type { LoginCode, User, WorkspaceData } from "@/lib/workspace/types";

/**
 * Authentification « sans blocage » :
 *  - code à 6 chiffres + lien magique par email (affichés directement en mode démo),
 *  - connexion invité et comptes démo en un clic,
 *  - mot de passe toujours optionnel ; en cas d'oubli ou d'erreur, le code email reste disponible.
 */
export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CODE_TTL_MIN = 30;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const normEmail = (e: string) => e.trim().toLowerCase();

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PublicUser = Omit<User, "passwordHash"> & { hasPassword: boolean };
export function toPublic(user: User): PublicUser {
  const { passwordHash, ...rest } = user;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

function upsertUser(data: WorkspaceData, email: string, name?: string): User {
  const e = normEmail(email);
  let user = data.users.find((u) => u.email === e);
  if (!user) {
    user = { id: newId("usr"), email: e, name: name?.trim() || e.split("@")[0], kind: "standard", createdAt: nowIso() };
    data.users.push(user);
  } else if (name?.trim() && user.kind === "standard" && user.name === user.email.split("@")[0]) {
    user.name = name.trim();
  }
  user.lastLoginAt = nowIso();
  return user;
}

async function sendSystemEmail(to: string, subject: string, body: string) {
  const result = await sendMail({ to: [to], subject, text: body });
  await withData((data) => {
    data.systemEmails.unshift({ id: newId("sys"), to, subject, body, status: result.ok ? (result.simulated ? "simule" : "envoye") : "echec", provider: result.provider, createdAt: nowIso() });
    if (data.systemEmails.length > 300) data.systemEmails.length = 300;
  });
  return result;
}

export type CodeRequestResult = { sent: true; simulated: boolean; demoCode?: string; demoLink?: string };

/** Envoie un code + lien magique. En mode simulation, ils sont aussi renvoyés pour un accès immédiat. */
export async function requestLoginCode(emailRaw: string, purpose: LoginCode["purpose"], baseUrl: string, name?: string): Promise<CodeRequestResult> {
  const email = normEmail(emailRaw ?? "");
  if (!EMAIL_RE.test(email)) throw new AuthError("Adresse email invalide.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = randomBytes(24).toString("base64url");
  await withData((data) => {
    data.loginCodes = data.loginCodes.filter((c) => !c.usedAt && new Date(c.expiresAt).getTime() > Date.now()).slice(-500);
    data.loginCodes.push({ id: newId("lc"), email, codeHash: sha(`${email}:${code}`), tokenHash: sha(token), purpose, name, expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString(), createdAt: nowIso() });
  });
  const link = `${baseUrl.replace(/\/$/, "")}/api/auth/magic?token=${token}`;
  const subject = purpose === "reinitialisation" ? "Co-founder — accès à votre compte (mot de passe oublié)" : "Co-founder — votre code de connexion";
  const body = `Bonjour,\n\nVotre code de connexion : ${code}\n\nOu cliquez sur ce lien magique (valable ${CODE_TTL_MIN} minutes) :\n${link}\n\n${purpose === "reinitialisation" ? "Une fois connecté(e), vous pourrez définir un nouveau mot de passe (facultatif) depuis « Mon compte ».\n\n" : ""}Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nCo-founder`;
  await sendSystemEmail(email, subject, body);
  const simulated = getMailConfig().mode === "simulation";
  return simulated ? { sent: true, simulated, demoCode: code, demoLink: link } : { sent: true, simulated };
}

function consume(data: WorkspaceData, match: (c: LoginCode) => boolean): LoginCode {
  const entry = data.loginCodes.find((c) => !c.usedAt && match(c));
  if (!entry) throw new AuthError("Code invalide ou déjà utilisé. Demandez un nouveau code — c'est instantané.", 401);
  if (new Date(entry.expiresAt).getTime() < Date.now()) throw new AuthError("Code expiré. Demandez-en un nouveau en un clic.", 401);
  entry.usedAt = nowIso();
  return entry;
}

export async function verifyCode(emailRaw: string, code: string) {
  const email = normEmail(emailRaw ?? "");
  const hash = sha(`${email}:${(code ?? "").replace(/\s/g, "")}`);
  return withData((data) => {
    const entry = consume(data, (c) => c.email === email && c.codeHash === hash);
    return { user: upsertUser(data, email, entry.name), purpose: entry.purpose };
  });
}

export async function verifyMagicToken(token: string) {
  const hash = sha(token ?? "");
  return withData((data) => {
    const entry = consume(data, (c) => c.tokenHash === hash);
    return { user: upsertUser(data, entry.email, entry.name), purpose: entry.purpose };
  });
}

/** Inscription immédiate : aucun blocage par vérification ; email de bienvenue avec code en complément. */
export async function signup(emailRaw: string, name: string, password?: string) {
  const email = normEmail(emailRaw ?? "");
  if (!EMAIL_RE.test(email)) throw new AuthError("Adresse email invalide.");
  const user = await withData((data) => {
    const u = upsertUser(data, email, name);
    if (password) u.passwordHash = hashPassword(password);
    return u;
  });
  await sendSystemEmail(email, "Bienvenue sur Co-founder", `Bonjour ${user.name},\n\nVotre compte est prêt. Vous pourrez toujours vous connecter avec un code envoyé par email — le mot de passe est facultatif.\n\nCo-founder`);
  return user;
}

export async function passwordLogin(emailRaw: string, password: string) {
  const email = normEmail(emailRaw ?? "");
  return withData((data) => {
    const user = data.users.find((u) => u.email === email);
    if (!user?.passwordHash || !checkPassword(password ?? "", user.passwordHash)) {
      throw new AuthError("Identifiants non reconnus. Recevez plutôt un code par email (aucun mot de passe nécessaire).", 401);
    }
    user.lastLoginAt = nowIso();
    return user;
  });
}

export async function setPassword(userId: string, password: string | null) {
  if (password !== null && password.length < 6) throw new AuthError("6 caractères minimum (ou laissez vide pour vous en passer).");
  return withData((data) => {
    const user = data.users.find((u) => u.id === userId);
    if (!user) throw new AuthError("Compte introuvable.", 404);
    user.passwordHash = password ? hashPassword(password) : undefined;
    return user;
  });
}

export async function guestLogin() {
  return withData((data) => {
    const id = newId("usr");
    const user: User = { id, email: `invite-${id.slice(4)}@invite.example.com`, name: "Invité", kind: "invite", createdAt: nowIso(), lastLoginAt: nowIso() };
    data.users.push(user);
    return user;
  });
}

export async function demoLogin(userId: string) {
  if (!SEED_USERS.some((u) => u.id === userId)) throw new AuthError("Compte démo inconnu.", 404);
  return withData((data) => {
    let user = data.users.find((u) => u.id === userId);
    if (!user) {
      const seed = SEED_USERS.find((u) => u.id === userId)!;
      user = { ...seed, createdAt: nowIso() };
      data.users.push(user);
    }
    user.lastLoginAt = nowIso();
    return user;
  });
}

export async function getUser(userId: string | undefined): Promise<User | null> {
  if (!userId) return null;
  const data = await readData();
  return data.users.find((u) => u.id === userId) ?? null;
}

export async function listSystemEmails() {
  return (await readData()).systemEmails;
}
