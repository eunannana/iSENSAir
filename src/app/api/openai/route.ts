import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to parse JSON safely
function safeJson(s: string) {
    try { return JSON.parse(s); } catch { return s; }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { prompt, payload, provider = "openai", category } = body;

        // ===== OpenAI Provider =====
        if (provider === "openai") {
            const res = await openaiClient.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are an AI that analyzes water quality datasets." },
                    { role: "user", content: `${prompt}\n\nData context:\n${JSON.stringify(payload).slice(0, 4000)}` },
                ],
                temperature: 0.3,
            });

            const text = res.choices[0]?.message?.content || "";
            return NextResponse.json({ text });
        }

        // ===== DeepSeek Provider =====
        if (provider === "deepseek") {
            const apiKey = process.env.DEEPSEEK_API_KEY;
            const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

            if (!apiKey) {
                return NextResponse.json({ error: "Missing DEEPSEEK_API_KEY" }, { status: 500 });
            }

            const system = [
                "You are a data analyst for river water quality.",
                "You receive a compact JSON summary from sensors.",
                "Be concise, structured, and specific. Use bullet points.",
            ].join(" ");

            const userMsg = [
                `${category ? `Category: ${category}` : ""}`,
                `Prompt: ${prompt}`,
                "JSON data summary:",
                "```json",
                JSON.stringify(payload, null, 2),
                "```",
            ].join("\n");

            const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: "system", content: system },
                        { role: "user", content: userMsg },
                    ],
                    temperature: 0.3,
                    max_tokens: 800,
                }),
            });

            const text = await res.text();
            if (!res.ok) {
                return NextResponse.json(
                    { error: "DeepSeek API failed", detail: safeJson(text) },
                    { status: 502 }
                );
            }

            const data = safeJson(text);
            const answer = data?.choices?.[0]?.message?.content?.trim?.() || "No content.";
            return NextResponse.json({ text: answer });
        }

        return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}

