import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { HttpError, handler, requireUser, requireWorkspace } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { ingestDocument } from "@/lib/rag/ingest";
import { MAX_UPLOAD_BYTES, detectMimeType } from "@/lib/rag/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const MAX_DOCS_PER_WORKSPACE = 20;

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireWorkspace(user.id, id);
  const docs = await getDb()
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.workspaceId, id))
    .orderBy(desc(schema.documents.createdAt));
  return NextResponse.json({ documents: docs });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireWorkspace(user.id, id);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file in the 'file' field");
  if (file.size === 0) throw new HttpError(400, "The file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files must be 10 MB or smaller");

  const mimeType = detectMimeType(file.name, file.type);
  if (!mimeType) throw new HttpError(415, "Upload a PDF, .txt or .md file");

  const existing = await getDb()
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(eq(schema.documents.workspaceId, id));
  if (existing.length >= MAX_DOCS_PER_WORKSPACE) {
    throw new HttpError(400, `A workspace can hold up to ${MAX_DOCS_PER_WORKSPACE} documents`);
  }

  const doc = await ingestDocument({
    workspaceId: id,
    name: file.name,
    mimeType,
    data: new Uint8Array(await file.arrayBuffer()),
  });
  return NextResponse.json({ document: doc }, { status: doc.status === "ready" ? 201 : 422 });
});
