export function numericColumns(schema: Record<string, string>) {
    return Object.entries(schema).filter(([, t]) => t === 'number').map(([k]) => k);
}
export function datetimeColumns(schema: Record<string, string>) {
    return Object.entries(schema).filter(([, t]) => t === 'datetime').map(([k]) => k);
}
