"use client";

import { useEffect, useState, useRef } from "react";
import HeroHeader from "@/components/HeroHeader";
import Visualizations from "@/components/Visualizations";
import DeepseekPanel from "@/components/openAIPanel";
import FileDropzone from "@/components/FileDropZone";
import CleanDataPanel from "@/components/CleanDataPanel";
import WeconTable from "@/components/WeconTable";

const FIXED_SCHEMA: Record<string, string> = {
  time: "datetime",
  Ph_Sensor: "number",
  ORP_Sensor: "number",
  CT_Sensor: "number",
  TDS_Sensor: "number",
  NH_Sensor: "number",
  DO_Sensor: "number",
  TR_Sensor: "number",
  BOD_Sensor: "number",
  COD_Sensor: "number",
  Predicted_Class: "string"
};

export default function Page() {
  
  return (
    <main className="min-h-screen bg-white">
      <HeroHeader />
      <WeconTable />
    </main>
  );
}
