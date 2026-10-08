/* Cleans HTML and SVG that comes from iticket before it is put into the page. */

const DROP_HTML = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,frame,frameset,noscript,template';
const DROP_SVG = 'script,foreignObject,iframe,object,embed,link,meta,base,animate,set,animateMotion,animateTransform';

const isBadUrl = (v: string) => /^\s*(javascript|vbscript|data:(?!image\/(png|jpe?g|gif|webp)))/i.test(v);

function cleanAttrs(root: Element) {
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src' || n === 'xlink:href' || n === 'action' || n === 'formaction') && isBadUrl(a.value)) el.removeAttribute(a.name);
      else if (n === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
}

/** Safe HTML for dangerouslySetInnerHTML: no scripts, styles, frames, event handlers or javascript: links. */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll(DROP_HTML).forEach((n) => n.remove());
  cleanAttrs(doc.body);
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  doc.body.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));
  return doc.body.innerHTML;
}

/** Plain text of an HTML fragment (for short previews). */
export function htmlText(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Parses an SVG file and returns a clean <svg> element ready to be adopted into the page: scripts, foreign
 * objects, links, animations and event handlers removed. The embedded <style> is kept but scoped to `scope`
 * (a class put on the container) so the plan's `.cls-N` rules cannot leak into the rest of the page.
 */
export function sanitizeSvg(text: string, scope: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  svg.querySelectorAll(DROP_SVG).forEach((n) => n.remove());
  cleanAttrs(svg);
  // Links inside a plan would navigate away on a seat click: keep their content, drop the link.
  svg.querySelectorAll('a').forEach((a) => a.replaceWith(...Array.from(a.childNodes)));
  svg.querySelectorAll('style').forEach((st) => {
    const css = (st.textContent || '').replace(/@import[^;]*;/gi, '').replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, 'none');
    // Prefix every selector of plain rules with the scope class.
    st.textContent = css.replace(/(^|})\s*([^{}@]+)\{/g, (_m, close: string, sel: string) => `${close} ${sel.split(',').map((s) => `.${scope} ${s.trim()}`).join(',')}{`);
  });
  return svg as unknown as SVGSVGElement;
}
