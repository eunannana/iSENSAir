export function lttb(
    data: { x: number; y: number }[],
    threshold = 2000
): { x: number; y: number }[] {
    const n = data.length;
    if (threshold >= n || threshold <= 0) return data.slice();

    const sampled: { x: number; y: number }[] = [];
    let a = 0;
    const bucketSize = (n - 2) / (threshold - 2);

    sampled.push(data[a]); // first point

    for (let i = 0; i < threshold - 2; i++) {
        const start = Math.floor((i + 1) * bucketSize) + 1;
        const end = Math.floor((i + 2) * bucketSize) + 1;
        const rangeEnd = Math.min(end, n);

        // average for next bucket
        let avgX = 0, avgY = 0;
        const avgRange = Math.max(1, rangeEnd - start);
        for (let j = start; j < rangeEnd; j++) {
            avgX += data[j].x;
            avgY += data[j].y;
        }
        avgX /= avgRange;
        avgY /= avgRange;

        const rangeOffs = Math.floor(i * bucketSize) + 1;
        const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

        let area = -1, nextA = rangeOffs;
        for (let j = rangeOffs; j < rangeTo; j++) {
            const dx1 = data[a].x - data[j].x;
            const dy1 = data[a].y - data[j].y;
            const dx2 = avgX - data[j].x;
            const dy2 = avgY - data[j].y;
            const thisArea = Math.abs(dx1 * dy2 - dx2 * dy1);
            if (thisArea > area) {
                area = thisArea;
                nextA = j;
            }
        }
        sampled.push(data[nextA]);
        a = nextA;
    }

    sampled.push(data[n - 1]); // last point
    return sampled;
}
