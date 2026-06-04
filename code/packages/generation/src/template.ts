export interface StructuredData {
    records: Record<string, string>;
}

export function fillTemplate(
    htmlContent: string,
    data: StructuredData,
): string {
    const replacedHtml = htmlContent.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        String(data.records[key] ?? ""),
    );
    return replacedHtml;
}

export function getTemplateFields(html: string): string[] {
    const matches = html.match(/\{\{(\w+)\}\}/g) ?? [];

    return [...new Set(
        matches.map(m => m.slice(2, -2))
    )];
}

export function validateTemplateData(
    html: string,
    data: StructuredData
) {
    const fields = getTemplateFields(html);

    const missing = fields.filter(field =>
        data.records[field] === undefined ||
        data.records[field] === null ||
        data.records[field] === ""
    );

    return {
        valid: missing.length === 0,
        missing,
    };
}

export function getUnusedFields(
    html: string,
    data: Record<string, unknown>
): string[] {
    const templateFields = getTemplateFields(html);

    return Object.keys(data).filter(
        key => !templateFields.includes(key)
    );
}