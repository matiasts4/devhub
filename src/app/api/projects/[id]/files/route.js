import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

// POST /api/projects/[id]/files
// Body: { files: [{ file_name, content, file_type }], user_id }
export async function POST(req, { params }) {
  try {
    const { id: project_id } = params;
    const { files, user_id } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const rows = files.map((f) => ({
      project_id,
      user_id,
      file_name: f.file_name,
      content: f.content,
      file_type: f.file_type || "text",
    }));

    const { data, error } = await supabase
      .from("project_files")
      .insert(rows)
      .select("id, file_name, file_type, size_chars, created_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, saved: data.length, files: data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/projects/[id]/files
export async function GET(req, { params }) {
  const { id: project_id } = params;
  const { data, error } = await supabase
    .from("project_files")
    .select("id, file_name, file_type, size_chars, created_at")
    .eq("project_id", project_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ total: data.length, files: data });
}

// DELETE /api/projects/[id]/files?file_id=uuid
export async function DELETE(req, { params }) {
  const { id: project_id } = params;
  const { searchParams } = new URL(req.url);
  const file_id = searchParams.get("file_id");
  if (!file_id) return NextResponse.json({ error: "file_id required" }, { status: 400 });

  const { error } = await supabase
    .from("project_files")
    .delete()
    .eq("id", file_id)
    .eq("project_id", project_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
