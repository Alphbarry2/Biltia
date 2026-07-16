// ─────────────────────────────────────────────────────────────────────────────
// Email de marque Biltia (barre d'accent + bouton dégradé), même identité que les
// templates Supabase. Partagé par toutes les routes qui envoient un email
// transactionnel via Resend (invitation, relance, notification de compte existant…).
// ─────────────────────────────────────────────────────────────────────────────

export function brandedEmailHtml(opts: { heading: string; body: string; btnText: string; btnUrl: string }): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FCFCFD;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;width:100%;background:#fff;border:1px solid #ECECF2;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(60,40,120,0.06);">
<tr><td style="height:4px;background:#7C3AED;background-image:linear-gradient(90deg,#6366F1,#8B5CF6,#EC4899);font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 36px 8px;"><table cellpadding="0" cellspacing="0" role="presentation"><tr>
<td><img src="https://www.biltia.com/icon.png" width="38" height="38" alt="Biltia" style="display:block;border-radius:10px;"></td>
<td style="padding-left:10px;font-size:17px;font-weight:800;letter-spacing:-0.02em;color:#0A0A0A;">Biltia</td>
</tr></table></td></tr>
<tr><td style="padding:20px 36px 0;"><h1 style="margin:0 0 10px;font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#0A0A0A;">${opts.heading}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5B5B66;">${opts.body}</p></td></tr>
<tr><td style="padding:0 36px 32px;"><a href="${opts.btnUrl}" style="display:inline-block;background:#7C3AED;background-image:linear-gradient(135deg,#6366F1 0%,#8B5CF6 55%,#EC4899 100%);color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:12px;box-shadow:0 8px 22px rgba(124,58,237,0.38);">${opts.btnText}</a></td></tr>
</table></td></tr></table>`;
}
