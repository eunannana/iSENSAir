const DATASETS = new Map<string, {
    schema: Record<string, string>;
    rows: Record<string, unknown>[];
    missing: Record<string, number>;
    outOfRange: Record<string, number>;
}>();

export function putDataset(id: string, data: {
    schema: Record<string, string>;
    rows: Record<string, unknown>[];
    missing: Record<string, number>;
    outOfRange: Record<string, number>;
}) {
    DATASETS.set(id, data);
}

export function getDataset(id: string) {
    return DATASETS.get(id);
}
