function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function brandingHeaderHtml(opts: { orgName: string; accentColor: string }): string {
    const name = opts.orgName.trim().length > 0 ? escapeHtml(opts.orgName) : 'Fortis'
    const color = /^#[0-9a-fA-F]{3,8}$/.test(opts.accentColor) ? opts.accentColor : '#3b82f6'
    return `<header style="border-bottom:3px solid ${color};padding-bottom:8px;margin-bottom:16px"><h1 style="color:${color};margin:0">${name}</h1><p style="margin:4px 0 0;color:#888">Compliance Report</p></header>`
}
