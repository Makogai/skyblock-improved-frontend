/** Direct Hypixel API calls from UI - no backend proxy. Requires VITE_HYPIXEL_API_KEY. */

const API_KEY = import.meta.env.VITE_HYPIXEL_API_KEY as string | undefined;
const BASE = 'https://api.hypixel.net';

export interface HypixelPlayer {
  uuid: string;
  displayname?: string;
  rank?: string;
  newPackageRank?: string;
  monthlyPackageRank?: string;
  firstLogin?: number;
  lastLogin?: number;
  stats?: Record<string, unknown>;
}

export interface HypixelPlayerResponse {
  success: boolean;
  player?: HypixelPlayer;
  cause?: string;
}

export interface SkyBlockMember {
  coin_purse?: number;
  last_save?: number;
  [key: string]: unknown;
}

export interface SkyBlockProfile {
  profile_id: string;
  cute_name: string;
  selected?: boolean;
  banking?: { balance?: number };
  members?: Record<string, { coin_purse?: number; [key: string]: unknown }>;
  game_mode?: string;
}

export interface SkyBlockProfilesResponse {
  success: boolean;
  profiles?: SkyBlockProfile[];
  cause?: string;
}

/** Skill XP thresholds (cumulative) - approx for level display */
const SKILL_XP_LEVELS = [
  0, 50, 125, 200, 300, 500, 750, 1000, 1500, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1100000, 1200000, 1300000, 1400000, 1500000, 1600000, 1700000, 1800000, 1900000, 2000000, 2100000, 2200000, 2300000, 2400000, 2500000, 2600000, 2750000, 2900000, 3100000, 3400000, 3700000, 4000000, 4300000, 4600000, 4900000, 5200000, 5500000, 5800000, 6100000, 6400000, 6700000, 7000000,
];
const SLAYER_XP_LEVELS: Record<string, number[]> = {
  zombie: [0, 5, 15, 200, 1000, 5000, 20000, 100000, 400000, 1000000],
  spider: [0, 5, 25, 200, 1000, 5000, 20000, 100000, 400000, 1000000],
  wolf: [0, 10, 30, 250, 1500, 5000, 20000, 100000, 400000, 1000000],
  enderman: [0, 10, 30, 250, 1500, 5000, 20000, 100000, 400000, 1000000],
  blaze: [0, 10, 25, 250, 1500, 5000, 20000, 100000, 400000, 1000000],
  vampire: [0, 20, 75, 240, 840, 2400],
};

function xpToLevel(xp: number, table: number[] = SKILL_XP_LEVELS): number {
  const tbl = table.length ? table : SKILL_XP_LEVELS;
  for (let i = tbl.length - 1; i >= 0; i--) {
    const thresh = tbl[i];
    if (thresh !== undefined && xp >= thresh) return Math.min(i + 1, 60);
  }
  return 1;
}

function getMember(members: Record<string, Record<string, unknown>>, uuidNorm: string): Record<string, unknown> | undefined {
  let m = members[uuidNorm];
  if (!m) {
    const e = Object.entries(members).find(([k]) => k.replace(/-/g, '').toLowerCase() === uuidNorm);
    m = e?.[1];
  }
  return m;
}

const SKILL_KEYS = ['farming', 'mining', 'combat', 'foraging', 'fishing', 'enchanting', 'alchemy', 'taming', 'carpentry'] as const;
const SLAYER_KEYS = ['zombie', 'spider', 'wolf', 'enderman', 'blaze', 'vampire'];

export interface SkillLevel {
  name: string;
  level: number;
  xp: number;
}

export interface SlayerLevel {
  name: string;
  level: number;
  xp: number;
}

export interface HypixelStats {
  purse: number;
  bank: number;
  profileName: string;
  gameMode?: string;
  lastSave?: number;
  skills: SkillLevel[];
  slayers: SlayerLevel[];
  fairySouls?: number;
  dungeons?: { level: number; class?: Record<string, number> };
}

export async function getHypixelPlayer(uuid: string): Promise<HypixelPlayer | null> {
  if (!API_KEY || !uuid) return null;
  try {
    const res = await fetch(`${BASE}/v2/player?uuid=${encodeURIComponent(uuid.replace(/-/g, ''))}`, {
      headers: { 'API-Key': API_KEY },
    });
    const data: HypixelPlayerResponse = await res.json();
    return data.success && data.player ? data.player : null;
  } catch {
    return null;
  }
}

function extractPurse(member: Record<string, unknown> | undefined): number {
  if (!member) return 0;
  const curr = member.currencies as { coin_purse?: number } | undefined;
  const n = curr?.coin_purse ?? member.coin_purse ?? member.purse;
  return typeof n === 'number' ? n : 0;
}

/** Official skill XP thresholds from Hypixel API (no key required). Cached. */
let skillLevelsCache: Record<string, number[]> | null = null;

async function fetchSkillLevels(): Promise<Record<string, number[]>> {
  if (skillLevelsCache) return skillLevelsCache;
  try {
    const res = await fetch(`${BASE}/v2/resources/skyblock/skills`);
    const data = await res.json();
    if (!data?.success || !data?.skills) return {};
    const out: Record<string, number[]> = {};
    for (const [skillId, skill] of Object.entries(data.skills as Record<string, { levels?: Array<{ level: number; totalExpRequired: number }> }>)) {
      const levels = skill?.levels;
      if (Array.isArray(levels)) {
        const tbl = levels
          .slice()
          .sort((a, b) => a.level - b.level)
          .map((l) => l.totalExpRequired ?? 0);
        out[skillId.toLowerCase()] = tbl;
      }
    }
    skillLevelsCache = out;
    return out;
  } catch {
    return {};
  }
}

/** Try SkyCrypt API for skills/slayers when Hypixel returns none (different data shape) */
async function fetchSkyCryptFallback(playerName: string): Promise<Partial<HypixelStats> | null> {
  try {
    const res = await fetch(`https://sky.shiiyu.moe/api/v2/profile/${encodeURIComponent(playerName)}`, { mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    const profiles = data?.profiles as Array<{ cute_name?: string; selected?: boolean; members?: Record<string, unknown> }> | undefined;
    const selected = profiles?.find((p) => p.selected) ?? profiles?.[0];
    const members = selected?.members ?? {};
    const member = Object.values(members)[0] as Record<string, unknown> | undefined;
    if (!member) return null;
    const skills: SkillLevel[] = [];
    const slayers: SlayerLevel[] = [];
    for (const [k, v] of Object.entries(member)) {
      if (k.toLowerCase().startsWith('experience_skill_') && typeof v === 'number' && v > 0) {
        const name = k.replace(/^experience_skill_/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        skills.push({ name, level: xpToLevel(v), xp: v });
      }
    }
    const sb = (member.slayer_bosses ?? member.slayer) as Record<string, { xp?: number }> | undefined;
    if (sb) {
      for (const [bossKey, boss] of Object.entries(sb)) {
        if (boss?.xp && typeof boss.xp === 'number') {
          const table = SLAYER_XP_LEVELS[bossKey.toLowerCase()];
          slayers.push({ name: bossKey.charAt(0).toUpperCase() + bossKey.slice(1), level: table ? xpToLevel(boss.xp, table) : 1, xp: boss.xp });
        }
      }
    }
    return skills.length || slayers.length ? { skills, slayers } : null;
  } catch {
    return null;
  }
}

export async function getSkyBlockProfiles(uuid: string, playerName?: string): Promise<HypixelStats | null> {
  if (!API_KEY || !uuid) return null;
  try {
    const dashUuid = uuid.includes('-') ? uuid : `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
    const res = await fetch(
      `${BASE}/v2/skyblock/profiles?uuid=${encodeURIComponent(dashUuid)}`,
      { headers: { 'API-Key': API_KEY } },
    );
    const data: SkyBlockProfilesResponse = await res.json();
    if (!data.success || !data.profiles?.length) return null;
    const selected = data.profiles.find((p) => p.selected) ?? data.profiles[0];
    if (!selected) return null;
    const uuidNorm = uuid.replace(/-/g, '').toLowerCase();
    const members = (selected.members ?? {}) as Record<string, Record<string, unknown>>;
    let member = getMember(members, uuidNorm) as Record<string, unknown> | undefined;
    let purse = extractPurse(member);
    // Always fetch full profile - skills/slayers/dungeons only come from /profile, not /profiles
    if (selected.profile_id) {
      try {
        const pr = await fetch(
          `${BASE}/v2/skyblock/profile?profile=${encodeURIComponent(selected.profile_id)}`,
          { headers: { 'API-Key': API_KEY } },
        );
        const pData = await pr.json();
        if (pData?.success && pData?.profile?.members) {
          const pm = getMember(pData.profile.members as Record<string, Record<string, unknown>>, uuidNorm) as Record<string, unknown>;
          if (pm) {
            member = pm;
            purse = extractPurse(pm) || purse;
          }
        }
      } catch {
        // ignore
      }
    }
    const bank = selected.banking?.balance ?? 0;
    const lastSave = member?.last_save;
    const skillNames: Record<string, string> = {
      farming: 'Farming', mining: 'Mining', combat: 'Combat', foraging: 'Foraging',
      fishing: 'Fishing', enchanting: 'Enchanting', alchemy: 'Alchemy', taming: 'Taming',
      carpentry: 'Carpentry', runecrafting: 'Runecrafting', social: 'Social', hunting: 'Hunting',
    };
    const officialSkillLevels = await fetchSkillLevels();
    const getSkillLevel = (xp: number, skillKey: string) => {
      const tbl = officialSkillLevels[skillKey.toLowerCase()];
      return tbl?.length ? xpToLevel(xp, tbl) : xpToLevel(xp);
    };
    const skills: SkillLevel[] = [];
    const addSkill = (key: string, xp: number) => {
      if (typeof xp !== 'number' || xp <= 0) return;
      const norm = key.replace(/^SKILL_/i, '').replace(/^experience_skill_/i, '').toLowerCase();
      const name = skillNames[norm] ?? norm.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      if (!skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        skills.push({ name, level: getSkillLevel(xp, norm), xp });
      }
    };
    // sbpv-style: member.player_data.experience with SKILL_FARMING, SKILL_COMBAT etc
    const playerData = member?.player_data as Record<string, unknown> | undefined;
    const expMap = playerData?.experience as Record<string, number> | undefined;
    if (expMap && typeof expMap === 'object') {
      for (const [k, v] of Object.entries(expMap)) {
        if (k !== 'SKILL_DUNGEONEERING') {
          const xpVal = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : Number(v);
          addSkill(k, xpVal);
        }
      }
    }
    // Legacy: experience_skill_farming, experience_skill_FARMING
    for (const key of [...SKILL_KEYS, 'runecrafting', 'social', 'hunting']) {
      const xp = (member?.[`experience_skill_${key}`] ?? member?.[`experience_skill_${key.toUpperCase()}`]) as number | undefined;
      addSkill(key, xp ?? 0);
    }
    // Nested: member.skills?.farming?.experience etc
    const skillsObj = member?.skills as Record<string, { experience?: number; xp?: number }> | undefined;
    if (skillsObj && skills.length === 0) {
      for (const [k, v] of Object.entries(skillsObj)) {
        if (v && typeof v === 'object') addSkill(k, v.experience ?? v.xp ?? 0);
      }
    }
    // Scan ALL member keys for experience_skill_*
    if (skills.length === 0 && member) {
      for (const [k, v] of Object.entries(member)) {
        if (k.toLowerCase().startsWith('experience_skill_') && typeof v === 'number') addSkill(k, v);
      }
    }
    const slayers: SlayerLevel[] = [];
    // sbpv: member.slayer.slayer_bosses | legacy: member.slayer_bosses | member.slayer as bosses map
    const slayerObj = member?.slayer as Record<string, unknown> | undefined;
    const sb =
      (slayerObj?.slayer_bosses as Record<string, Record<string, unknown>>) ??
      (member?.slayer_bosses as Record<string, Record<string, unknown>>) ??
      (slayerObj && !slayerObj.slayer_bosses ? (slayerObj as Record<string, Record<string, unknown>>) : undefined);
    const addSlayer = (bossKey: string, boss: Record<string, unknown>) => {
      const xp = (boss.xp ?? boss.total_experience ?? (boss as { total_exp?: number }).total_exp) as number | undefined;
      if (typeof xp === 'number' && xp > 0) {
        const key = bossKey.toLowerCase();
        const table = SLAYER_XP_LEVELS[key];
        slayers.push({ name: bossKey.charAt(0).toUpperCase() + bossKey.slice(1), level: table ? xpToLevel(xp, table) : 1, xp });
      }
    };
    if (sb) {
      for (const key of SLAYER_KEYS) {
        const boss = sb[key];
        if (boss && typeof boss === 'object') addSlayer(key, boss as Record<string, unknown>);
      }
      if (slayers.length === 0) {
        for (const [bossKey, bossData] of Object.entries(sb)) {
          if (bossData && typeof bossData === 'object') addSlayer(bossKey, bossData as Record<string, unknown>);
        }
      }
    }
    const fairySoulObj = member?.fairy_soul as { total_collected?: number } | undefined;
    const fairySouls = (fairySoulObj?.total_collected ?? member?.fairy_souls_collected ?? member?.fairy_souls) as number | undefined;
    let dungeons: { level: number } | undefined;
    const dng = member?.dungeons as Record<string, unknown> | undefined;
    const dt = (member?.dungeon_types ?? dng?.dungeon_types ?? (dng?.dungeons as Record<string, unknown>)?.dungeon_types) as { catacombs?: { experience?: number }; catacombs_exp?: number } | undefined;
    let cataXp = dt?.catacombs?.experience ?? dt?.catacombs_exp ?? (member?.experience_dungeon_types_catacombs as number | undefined);
    if (typeof cataXp !== 'number' && dng) {
      const cata = (dng as Record<string, unknown>).catacombs ?? (dng as Record<string, unknown>).dungeon_types;
      cataXp = (cata as { experience?: number })?.experience;
    }
    if (typeof cataXp === 'number' && cataXp > 0) {
      dungeons = { level: Math.min(xpToLevel(cataXp, SKILL_XP_LEVELS), 50) };
    }
    // SkyCrypt fallback when Hypixel returns no skills/slayers
    if ((skills.length === 0 || slayers.length === 0) && playerName) {
      const fallback = await fetchSkyCryptFallback(playerName);
      if (fallback?.skills?.length) skills.push(...fallback.skills);
      if (fallback?.slayers?.length) slayers.push(...fallback.slayers);
    }
    return {
      purse,
      bank,
      profileName: selected.cute_name ?? 'Unknown',
      gameMode: selected.game_mode,
      lastSave: typeof lastSave === 'number' ? lastSave : undefined,
      skills,
      slayers,
      fairySouls: typeof fairySouls === 'number' ? fairySouls : undefined,
      dungeons,
    };
  } catch {
    return null;
  }
}

export function skyCryptUrl(playerName: string): string {
  return `https://sky.shiiyu.moe/stats/${encodeURIComponent(playerName)}`;
}

export function hasHypixelKey(): boolean {
  return !!API_KEY;
}
