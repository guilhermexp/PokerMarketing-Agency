const SCRIPT_TAG_PATTERN = /<script\b(?![^>]*\bnonce=)([^>]*)>/gi;

export function injectNonceIntoHtml(html: string, nonce: string): string {
  return html.replace(SCRIPT_TAG_PATTERN, (_match, attributes: string) => {
    return `<script nonce="${nonce}"${attributes}>`;
  });
}
