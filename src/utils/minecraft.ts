/** Minecraft § color/format codes → HTML. Escapes raw text for safety. */
const MC_COLORS: Record<string, string> = {
  '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa', '4': '#aa0000', '5': '#aa00aa',
  '6': '#ffaa00', '7': '#aaaaaa', '8': '#555555', '9': '#5555ff', 'a': '#55ff55', 'b': '#55ffff',
  'c': '#ff5555', 'd': '#ff55ff', 'e': '#ffff55', 'f': '#ffffff',
};

export function parseMcFormat(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const out: string[] = [];
  let i = 0;
  let color = '';
  let bold = false;
  let italic = false;
  let underline = false;
  let strikethrough = false;
  let buf = '';
  const flush = () => {
    if (buf) {
      const styles: string[] = [];
      if (color) styles.push(`color:${color}`);
      if (bold) styles.push('font-weight:bold');
      if (italic) styles.push('font-style:italic');
      const dec: string[] = [];
      if (underline) dec.push('underline');
      if (strikethrough) dec.push('line-through');
      if (dec.length) styles.push(`text-decoration:${dec.join(' ')}`);
      out.push(styles.length ? `<span style="${styles.join(';')}">${esc(buf)}</span>` : esc(buf));
      buf = '';
    }
  };
  while (i < text.length) {
    if (text[i] === '§' && i + 1 < text.length) {
      flush();
      const code = text[i + 1].toLowerCase();
      i += 2;
      if (code === 'r') {
        color = '';
        bold = italic = underline = strikethrough = false;
      } else if (MC_COLORS[code]) {
        color = MC_COLORS[code];
      } else if (code === 'l') bold = true;
      else if (code === 'o') italic = true;
      else if (code === 'n') underline = true;
      else if (code === 'm') strikethrough = true;
      else if (code === 'k') { /* obfuscated - show as-is */ }
    } else {
      buf += text[i];
      i++;
    }
  }
  flush();
  return out.join('');
}

/** mc-heads.net – Minecraft player head (accepts name or UUID) */
export function playerSkinUrl(playerNameOrUuid: string, size = 48): string {
  if (!playerNameOrUuid) return '';
  const encoded = encodeURIComponent(playerNameOrUuid);
  return `https://mc-heads.net/avatar/${encoded}/${size}`;
}

/** mc-heads.net – Full body player skin (accepts name or UUID) */
export function playerFullBodyUrl(playerNameOrUuid: string, size = 128): string {
  if (!playerNameOrUuid) return '';
  const encoded = encodeURIComponent(playerNameOrUuid);
  return `https://mc-heads.net/player/${encoded}/${size}`;
}
