export type Schema = Record<string, 'number' | 'string' | 'datetime'>;

export type CleanPayload = {
    dataset_id: string;
    schema: Schema;
    clean_rows: Record<string, unknown>[];
    missing_report: Record<string, number>;
    out_of_range_report: Record<string, number>;
};
