import { NextResponse } from 'next/server';
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Intentamos instanciar OpenAI si existe la KEY
let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req) {
  try {
    const { query, project_id } = await req.json();
    if (!query || !project_id) return NextResponse.json({ error: 'Missing query or project_id' }, { status: 400 });

    let memories = [];
    if (openai) {
      const resp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query
      });
      const embedding = `[${resp.data[0].embedding.join(",")}]`;

      const { data, error } = await supabase.rpc('search_memory_semantic', {
        p_project_id: project_id,
        p_query_embedding: embedding,
        p_match_threshold: 0.7,
        p_match_count: 5
      });
      if (!error) memories = data || [];
    } else {
      const { data, error } = await supabase.rpc('search_memory_fts', {
        p_project_id: project_id,
        p_query: query,
        p_tipo: 'all',
        p_limit: 5
      });
      if (!error) memories = data || [];
    }

    // 2. Read Docs structure (dummy simulation info for prompt)
    const docsInfo = "Docs read dynamically in production";

    if (openai) {
      const systemPrompt = `You are the AI assistant of the project. Answer the user question based on these memories:\n${JSON.stringify(memories)}`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: query }],
      });
      
      const answer = completion.choices[0].message.content;
      return NextResponse.json({ answer, sources: memories });
    } else {
      const combined = memories.length ? memories.map(m => `- ${m.key} (${m.tipo}): ${m.value}`).join("\n") : 'No se encontraron datos.';
      return NextResponse.json({
        answer: `(Mock Answer due to missing OPENAI_API_KEY) Based on internal knowledge:\n${combined}`,
        sources: memories
      });
    }

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
