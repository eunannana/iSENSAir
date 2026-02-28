export const runtime = "nodejs";

// import SftpClient from "ssh2-sftp-client";
// import { parse } from "csv-parse/sync";

export async function GET(request: Request) {
  const sftp = new SftpClient();

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");
    const area = searchParams.get("area");

    // ===============================
    // AREA → DEVICE MAPPING
    // ===============================
    const areaDeviceMap: Record<string, string> = {
      kechau: "VNET-KECHAU-01",
      bilut: "VNET-BILUT-01",
      semantan: "VNET-SEMANTAN-01",
    };

    const selectedDevice = area
      ? areaDeviceMap[area.toLowerCase()]
      : null;

    // ===============================
    // BUILD DATE RANGE (INCLUSIVE)
    // ===============================
    let start: Date | null = null;
    let end: Date | null = null;

    if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    await sftp.connect({
      host: process.env.SFTP_HOST as string,
      port: Number(process.env.SFTP_PORT),
      username: process.env.SFTP_USER as string,
      password: process.env.SFTP_PASS as string,
    });

    const remotePath = process.env.SFTP_PATH as string;
    const fileList = await sftp.list(remotePath);

    let csvFiles = fileList.filter((f: any) =>
      f.name.endsWith(".csv")
    );

    let allRows: any[] = [];

    for (const file of csvFiles) {
      const fileData = await sftp.get(`${remotePath}/${file.name}`);
      const csvText = fileData.toString("utf-8");

      const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ",",
        relax_quotes: true,
        relax_column_count: true,
        trim: true,
      });

      allRows.push(...records);
    }

    await sftp.end();

    // ===============================
    // FILTER BY DEVICE (AREA)
    // ===============================
    if (selectedDevice) {
      allRows = allRows.filter(
        (row) => row.Device_ID === selectedDevice
      );
    }

    // ===============================
    // FILTER BY TIMESTAMP RANGE
    // ===============================
    if (start && end) {
      allRows = allRows.filter((row) => {
        const rowDate = parseTimestamp(row.Timestamp);
        if (!rowDate) return false;
        return rowDate >= start!.getTime() &&
               rowDate <= end!.getTime();
      });
    }

    // ===============================
    // FILTER SENSOR ≠ 0
    // ===============================
    const sensorKeys = [
      "Tr_Sensor",
      "BOD_Sensor",
      "DO_Sensor",
      "COD_Sensor",
      "NH_Sensor",
      "TDS_Sensor",
      "CT_Sensor",
      "ORP_Sensor",
      "pH_Sensor",
    ];

    let filteredRows = allRows.filter((row) =>
      sensorKeys.some((key) => {
        const val = parseFloat(row[key]);
        return !isNaN(val) && val !== 0;
      })
    );

    // ===============================
    // SORT BY REAL TIMESTAMP ASC
    // ===============================
    filteredRows.sort(
      (a, b) =>
        parseTimestamp(a.Timestamp) -
        parseTimestamp(b.Timestamp)
    );

    // ===============================
    // FORMAT NUMBER 2 DECIMAL
    // ===============================
    filteredRows = filteredRows.map((row) => {
      const newRow = { ...row };

      sensorKeys.forEach((key) => {
        const val = parseFloat(newRow[key]);
        if (!isNaN(val)) {
          newRow[key] = val.toFixed(2);
        }
      });

      return newRow;
    });

    return Response.json(filteredRows.slice(0, 1000));

  } catch (err) {
    console.error(err);
    return Response.json({ error: "SFTP failed" }, { status: 500 });
  }
}

// ===============================
// PARSE TIMESTAMP DD/MM/YYYY HH:mm:ss
// ===============================
function parseTimestamp(ts: string): number {
  if (!ts) return 0;

  const [datePart, timePart] =
    ts.split(",").length > 1
      ? ts.split(",").map((s) => s.trim())
      : ts.split(" ");

  if (!datePart) return 0;

  const [day, month, year] = datePart.split("/");
  const timeArray = timePart
    ? timePart.split(":").map(Number)
    : [0, 0, 0];

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    timeArray[0] || 0,
    timeArray[1] || 0,
    timeArray[2] || 0
  ).getTime();
}
