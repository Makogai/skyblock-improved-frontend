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
