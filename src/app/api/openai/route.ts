import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Safe JSON helper
function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      prompt,
      category,
      rows,
      provider = "openai",
    } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    // Ensure rows is always array
    const safeRows = Array.isArray(rows) ? rows.slice(-200) : [];

    /* ================= OPENAI ================= */
    if (provider === "openai") {
      const userContent = `
Category: ${category || "General Analysis"}

Prompt:
${prompt}

Recent Water Quality Data (last ${safeRows.length} records):
${JSON.stringify(safeRows, null, 2)}
`;

      const res = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a professional environmental data analyst specializing in river water quality monitoring.",
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      });

      const text =
        res.choices?.[0]?.message?.content?.trim() ||
        "No response generated.";

      return NextResponse.json({ text });
    }

    /* ================= DEEPSEEK ================= */
    if (provider === "deepseek") {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      const model =
        process.env.DEEPSEEK_MODEL || "deepseek-chat";

      if (!apiKey) {
        return NextResponse.json(
          { error: "Missing DEEPSEEK_API_KEY" },
          { status: 500 }
        );
      }

      const systemMessage =
        "You are an expert water quality analyst. Provide structured, concise insights using bullet points.";

      const userMessage = `
Category: ${category || "General Analysis"}

Prompt:
${prompt}

Recent Data:
${JSON.stringify(safeRows, null, 2)}
`;

      const res = await fetch(
        "https://api.deepseek.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 800,
          }),
        }
      );

      const raw = await res.text();

      if (!res.ok) {
        return NextResponse.json(
          {
            error: "DeepSeek API failed",
            detail: safeJsonParse(raw),
          },
          { status: 502 }
        );
      }

      const data = safeJsonParse(raw);

      const answer =
        data?.choices?.[0]?.message?.content?.trim() ||
        "No content returned.";

      return NextResponse.json({ text: answer });
    }

    return NextResponse.json(
      { error: "Invalid provider" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}