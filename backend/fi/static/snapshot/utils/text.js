export function truncateText(text, textProcessing = {}) {
    if (text == null) return '';
    let t = String(text);
    if (!textProcessing.preserve_whitespace) {
        t = t.replace(/\s+/g, ' ').trim();
    }
    const maxLen = typeof textProcessing.max_text_length === 'number' ? textProcessing.max_text_length : 100;
    const suffix = textProcessing.truncate_suffix || '...';
    if (t.length > maxLen) {
        return t.slice(0, maxLen) + suffix;
    }
    return t;
}


