import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const datasetId = (form.get("datasetId") as string) || `${Date.now()}`;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const mlUrl = process.env.ML_SERVICE_URL || "https://naufalrozan-isense-air-service.hf.space";
    const fd = new FormData();
    fd.append("file", file, "upload.csv");
    fd.append("dataset_id", datasetId);

    const res = await fetch(`${mlUrl}/process`, { method: "POST", body: fd });
    if (!res.ok) return NextResponse.json({ error: "ML service failed" }, { status: 500 });

    const payload = await res.json();
    return NextResponse.json(payload);
}
