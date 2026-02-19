export function normalizeUrl(url) {
    if (!url) return '';
    return url.replace(/\/+$/, '');
}

export function getClientUrl() {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    return normalizeUrl(clientUrl);
}

export function buildClientUrl(path) {
    const baseUrl = getClientUrl();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
}
