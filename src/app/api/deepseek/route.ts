import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { category, prompt, payload } = body || {};

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
            `Category: ${category}`,
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

        const text = await res.text(); // ambil teks agar bisa dikembalikan saat error
        if (!res.ok) {
            return NextResponse.json(
                { error: "DeepSeek API failed", detail: safeJson(text) },
                { status: 502 }
            );
        }

        const data = safeJson(text);
        const answer = data?.choices?.[0]?.message?.content?.trim?.() || "No content.";
        return NextResponse.json({ text: answer });
    } catch (e: any) {
        return NextResponse.json(
            { error: "Server error", detail: String(e?.message || e) },
            { status: 500 }
        );
    }
}

function safeJson(s: string) {
    try { return JSON.parse(s); } catch { return s; }
}
