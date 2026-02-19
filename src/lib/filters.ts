import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

export function bucketTime(rows: Record<string, unknown>[], timeKey: string, mode: 'all' | 'daily' | 'weekly' | 'monthly') {
    if (mode === 'all') return rows;
    const group = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
        const d = dayjs(r[timeKey] as string | number | Date | null | undefined);
        if (!d.isValid()) continue;
        let key = '';
        if (mode === 'daily') key = d.format('YYYY-MM-DD');
        if (mode === 'weekly') key = `${d.year()}-W${d.isoWeek()}`;
        if (mode === 'monthly') key = d.format('YYYY-MM');
        if (!group.has(key)) group.set(key, []);
        group.get(key)!.push(r);
    }
    return [...group.entries()].map(([k, v]) => ({ __bucket: k, __rows: v }));
}

export function monthChoices(rows: Record<string, unknown>[], timeKey: string) {
    const set = new Set<string>();
    for (const r of rows) {
        const d = dayjs(r[timeKey] as string | number | Date | null | undefined);
        if (d.isValid()) set.add(d.format('YYYY-MM'));
    }
    return [...set].sort().map(m => ({ value: m, label: m }));
}
