import { assertCompanyAccess } from "@/lib/workspace/access";
import { WorkspaceError } from "@/lib/workspace/service";
import { handlePaid } from "@/lib/workspace/http";
import { MAX_AUDIO_BYTES, transcribeAudio } from "@/lib/modules/memoire/transcribe";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Transcription d'un enregistrement de réunion (Groq/OpenAI Whisper si clé, sinon démo marquée). */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new WorkspaceError("Envoyez le fichier audio en multipart/form-data (champ « audio »).");
    }
    await assertCompanyAccess(String(form.get("companyId") ?? ""), viewer);
    const file = form.get("audio");
    if (!(file instanceof Blob) || file.size === 0) throw new WorkspaceError("Fichier audio manquant.");
    if (file.size > MAX_AUDIO_BYTES) throw new WorkspaceError("Fichier audio trop volumineux (25 Mo max).", 413);
    if (file.type && !/^(audio|video)\//.test(file.type)) throw new WorkspaceError("Format non pris en charge : envoyez un fichier audio.");
    return transcribeAudio(file, (file as File).name || "reunion.webm");
  });
}
