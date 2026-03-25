import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PA {
  inning: number;
  inning_half?: string;
  opponent?: string;
  opponent_pitcher_name?: string;
  opponent_batter_name?: string;
  result_type: string;
  pitch_count?: number;
  start_outs?: number;
  runner_1b?: number;
  runner_2b?: number;
  runner_3b?: number;
}

interface DailyRecord {
  game_date: string;
  opponent?: string;
  pa?: number;
  ab?: number;
  hits?: number;
  h?: number;
  h_against?: number;
  hr?: number;
  bb?: number;
  bb_against?: number;
  so?: number;
  avg?: number;
  outs?: number;
  ip?: number | string;
  pa_against?: number;
  whip?: number;
  plate_appearances?: PA[];
}

interface PitchMixRow {
  pitch_type: string;
  cnt: number;
  avg_speed: number;
  max_speed: number;
}

interface PitchZoneRow {
  pitch_type: string;
  cnt: number;
  pct: number;
  avg_speed: number;
  max_speed: number;
  heart_pct: number;
  zone_pct: number;
  shadow_pct: number;
  chase_pct: number;
  waste_pct: number;
  whiff_pct: number | null;
  whiff_z: number | null;
  whiff_oz: number | null;
  chase_rate: number | null;
  swing_pct: number | null;
}

interface BatterDisciplineRow {
  pitch_type: string;
  cnt: number;
  pct: number;
  avg_speed: number;
  max_speed: number;
  swings: number;
  whiffs: number;
  out_zone: number;
  chase_swings: number;
  whiff_pct: number | null;
  whiff_z: number | null;
  whiff_oz: number | null;
  chase_pct: number | null;
  swing_pct: number | null;
}

interface Summary {
  role: string;
  pcode: string;
  player_name?: string;
  team_code?: string;
  [key: string]: unknown;
}

interface H2hBatter {
  pa: number; ab: number; hits: number; hr: number;
  bb: number; hbp: number; so: number;
  avg: number | null; obp: number | null; slg: number | null; ops: number | null;
}

interface H2hPitcher {
  bf: number; outs: number; ip_display: string;
  h: number; bb: number; so: number;
  baa: number | null; whip: number | null; ra9: number | null;
  ops_against: number | null;
}

interface VelocityContactBand {
  velocity_band: number;
  label: string;
  total: number;
  swings: number;
  contacts: number;
  whiffs: number;
  contact_pct: number | null;
  whiff_pct: number | null;
  fb_total: number;
  fb_swings: number;
  fb_contacts: number;
  fb_whiffs: number;
  fb_contact_pct: number | null;
  fb_whiff_pct: number | null;
}

interface PlayerData {
  season: number;
  summary: Summary;
  daily: DailyRecord[];
  pitch_mix?: PitchMixRow[];
  pitch_zones?: PitchZoneRow[];
  h2h?: H2hBatter | H2hPitcher | null;
  batter_discipline?: BatterDisciplineRow[];
  velocity_contact?: VelocityContactBand[];
}

// ─── Statcast pitch grouping ────────────────────────────────────────────────

type PitchGroup = 'fastball' | 'breaking' | 'offspeed';

const PITCH_GROUP_MAP: Record<string, PitchGroup> = {
  '직구': 'fastball', '투심': 'fastball', '커터': 'fastball', '싱커': 'fastball',
  '슬라이더': 'breaking', '커브': 'breaking', '스위퍼': 'breaking', '너클볼': 'breaking',
  '체인지업': 'offspeed', '포크': 'offspeed',
};

const PITCH_GROUP_ORDER: PitchGroup[] = ['fastball', 'breaking', 'offspeed'];

const PITCH_GROUP_META: Record<PitchGroup, { label: string; labelEn: string; color: string; bg: string; border: string; headerBg: string }> = {
  fastball: { label: '패스트볼', labelEn: 'Fastball', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', headerBg: 'bg-red-50' },
  breaking: { label: '브레이킹', labelEn: 'Breaking', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', headerBg: 'bg-violet-50' },
  offspeed: { label: '오프스피드', labelEn: 'Offspeed', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', headerBg: 'bg-emerald-50' },
};

const PITCH_ORDER_WITHIN_GROUP: Record<PitchGroup, string[]> = {
  fastball: ['직구', '투심', '커터', '싱커'],
  breaking: ['슬라이더', '커브', '스위퍼', '너클볼'],
  offspeed: ['체인지업', '포크'],
};

function groupPitchTypes<T extends { pitch_type: string }>(rows: T[]): { group: PitchGroup; meta: typeof PITCH_GROUP_META['fastball']; items: T[] }[] {
  return PITCH_GROUP_ORDER
    .map(group => {
      const order = PITCH_ORDER_WITHIN_GROUP[group];
      const items = rows
        .filter(r => (PITCH_GROUP_MAP[r.pitch_type] ?? 'offspeed') === group)
        .sort((a, b) => order.indexOf(a.pitch_type) - order.indexOf(b.pitch_type));
      return { group, meta: PITCH_GROUP_META[group], items };
    })
    .filter(g => g.items.length > 0);
}

// ─── Team mapping ─────────────────────────────────────────────────────────────

const TEAM_NAME: Record<string, string> = {
  SS: '삼성', SK: 'SSG', LG: 'LG', KT: 'KT', NC: 'NC',
  HH: '한화', LT: '롯데', HT: 'KIA', WO: '키움', OB: '두산',
};

const TEAM_COLOR: Record<string, string> = {
  SS: '#074CA1',
  SK: '#CE0E2D',
  LG: '#C30452',
  KT: '#000000',
  NC: '#315288',
  HH: '#F37321',
  LT: '#041E42',
  HT: '#EA0029',
  WO: '#820024',
  OB: '#131230',
};

const teamName = (code: string) => TEAM_NAME[code] ?? code;
const teamColor = (code: string) => TEAM_COLOR[code] ?? '#374151';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt3 = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '.---';
  return v.toFixed(3).replace(/^0/, '');
};

const fmt2 = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '--';
  return v.toFixed(2);
};

const fmtIP = (ip: number | string | null | undefined): string => {
  if (ip == null) return '-';
  if (typeof ip === 'string') return ip;
  const full = Math.floor(ip);
  const third = Math.round((ip - full) * 10);
  return `${full}.${third}`;
};

const resultColor = (rt: string): string => {
  const r = rt?.toLowerCase() ?? '';
  if (r.includes('hr')) return 'text-yellow-600 font-bold';
  if (r.includes('single') || r.includes('double') || r.includes('triple'))
    return 'text-green-600 font-semibold';
  if (r.includes('bb') || r.includes('walk') || r.includes('hbp'))
    return 'text-blue-500';
  if (r.includes('strikeout'))
    return 'text-purple-500';
  if (r.includes('out') || r.includes('fc') || r.includes('sac'))
    return 'text-red-500';
  return 'text-gray-400';
};

function formatRunners(r1b: number, r2b: number, r3b: number): string {
  if (!r1b && !r2b && !r3b) return '주자없음';
  if (r1b && r2b && r3b) return '만루';
  const bases: string[] = [];
  if (r1b) bases.push('1루');
  if (r2b) bases.push('2루');
  if (r3b) bases.push('3루');
  return bases.join(',');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}.${day} (${days[d.getDay()]})`;
}

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
  </div>
);

// ─── Batter summary badges ───────────────────────────────────────────────────

const BATTER_BADGES = [
  { key: 'pa', label: 'PA' },
  { key: 'ab', label: 'AB' },
  { key: 'hits', label: 'H' },
  { key: 'doubles', label: '2B' },
  { key: 'triples', label: '3B' },
  { key: 'hr', label: 'HR' },
  { key: 'bb', label: 'BB' },
  { key: 'hbp', label: 'HBP' },
  { key: 'so', label: 'SO' },
  { key: 'avg', label: 'AVG', fmt: fmt3 },
  { key: 'obp', label: 'OBP', fmt: fmt3 },
  { key: 'slg', label: 'SLG', fmt: fmt3 },
  { key: 'ops', label: 'OPS', fmt: fmt3 },
];

const PITCHER_BADGES = [
  { key: 'pa_against', label: 'BF' },
  { key: 'ip', label: 'IP' },
  { key: 'h_against', label: 'H' },
  { key: 'hr_against', label: 'HR' },
  { key: 'bb_against', label: 'BB' },
  { key: 'so', label: 'SO' },
  { key: 'baa', label: 'BAA', fmt: fmt3 },
  { key: 'whip', label: 'WHIP', fmt: fmt2 },
  { key: 'k_bb', label: 'K/BB', fmt: fmt2 },
  { key: 'ra9', label: 'RA9', fmt: fmt2 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExhibitionPlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // season param kept for URL compatibility; not used in static fetch
  const season = Number(searchParams.get('season')) || new Date().getFullYear();

  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    setData(null);
    setExpandedDays(new Set());

    fetch(`/data/players/${playerId}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(playerData => {
        // Build a PlayerData object from the bundled static JSON
        const result: PlayerData = {
          season: playerData.season ?? season,
          summary: {} as Summary,
          daily: [],
        };

        // daily section: summary + records
        if (playerData.daily) {
          const d = playerData.daily;
          result.summary = d.summary ?? ({} as Summary);
          result.daily = d.records ?? [];
          if (d.pitch_mix) result.pitch_mix = d.pitch_mix;
        }

        // profile/zone section (pitcher)
        if (playerData.profile) {
          const z = playerData.profile;
          if (z.pitch_mix) result.pitch_mix = z.pitch_mix;
          if (z.pitch_types) result.pitch_zones = z.pitch_types;
          if (z.zones) result.pitch_zones = z.zones;
        }

        // h2h section
        if (playerData.h2h) {
          result.h2h = playerData.h2h.h2h ?? playerData.h2h;
        }

        // discipline section (batter)
        if (playerData.discipline) {
          result.batter_discipline = playerData.discipline.pitch_types ?? [];
        }

        // velocity-contact section (batter)
        if (playerData.velocity) {
          result.velocity_contact = playerData.velocity.bands ?? [];
        }

        setData(result);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [playerId]);

  useEffect(() => {
    if (data?.summary?.player_name) {
      document.title = `${data.summary.player_name} - 시범경기 | BallTology`;
    }
  }, [data]);

  const toggleDay = (key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error ?? '데이터를 불러올 수 없습니다'}</p>
          <button
            onClick={() => navigate('/exhibition')}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-600 hover:text-gray-900 transition-colors"
          >
            리더보드로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const { summary, daily, pitch_mix, pitch_zones, h2h, batter_discipline, velocity_contact } = data;
  const isBatter = summary.role === 'batter';
  const badges = isBatter ? BATTER_BADGES : PITCHER_BADGES;
  const tc = summary.team_code as string | undefined;

  // Delta display helper: positive is colored, null returns '-'
  const fmtDelta = (overall: number | null | undefined, h2hVal: number | null | undefined, inverse = false): { text: string; cls: string } => {
    if (overall == null || h2hVal == null) return { text: '-', cls: 'text-gray-300' };
    const diff = h2hVal - overall;
    if (Math.abs(diff) < 0.001) return { text: '-', cls: 'text-gray-300' };
    const sign = diff > 0 ? '+' : '';
    const isGood = inverse ? diff < 0 : diff > 0;
    return {
      text: `${sign}${diff.toFixed(3).replace(/^-?0/, m => m.startsWith('-') ? '-' : '')}`,
      cls: isGood ? 'text-green-600' : 'text-red-500'
    };
  };

  // Build comparison rows
  type CompRow = { label: string; overall: number | null; h2hVal: number | null; type: string; bold?: boolean; inverse?: boolean; h2hDisplay?: string };
  const comparisonRows: CompRow[] | null = (() => {
    if (!h2h) return null;
    if (isBatter) {
      const h = h2h as H2hBatter;
      const s = summary;
      return [
        { label: 'PA', overall: s.pa as number, h2hVal: h.pa, type: 'int' },
        { label: 'H', overall: s.hits as number, h2hVal: h.hits, type: 'int' },
        { label: 'HR', overall: s.hr as number, h2hVal: h.hr, type: 'int' },
        { label: 'BB', overall: s.bb as number, h2hVal: h.bb, type: 'int' },
        { label: 'SO', overall: s.so as number, h2hVal: h.so, type: 'int' },
        { label: 'AVG', overall: s.avg as number, h2hVal: h.avg, type: 'rate' },
        { label: 'OBP', overall: s.obp as number, h2hVal: h.obp, type: 'rate' },
        { label: 'SLG', overall: s.slg as number, h2hVal: h.slg, type: 'rate' },
        { label: 'OPS', overall: s.ops as number, h2hVal: h.ops, type: 'rate', bold: true },
      ];
    } else {
      const h = h2h as H2hPitcher;
      const s = summary;
      return [
        { label: 'BF', overall: s.pa_against as number, h2hVal: h.bf, type: 'int' },
        { label: 'IP', overall: s.ip as number, h2hVal: null, type: 'ip', h2hDisplay: h.ip_display },
        { label: 'SO', overall: s.so as number, h2hVal: h.so, type: 'int' },
        { label: 'BB', overall: s.bb_against as number, h2hVal: h.bb, type: 'int' },
        { label: 'BAA', overall: s.baa as number, h2hVal: h.baa, type: 'rate', inverse: true },
        { label: 'WHIP', overall: s.whip as number, h2hVal: h.whip, type: 'rate2', inverse: true },
        { label: 'RA9', overall: s.ra9 as number, h2hVal: h.ra9, type: 'rate2', inverse: true },
        { label: 'OPS Against', overall: null, h2hVal: h.ops_against, type: 'rate', bold: true },
      ];
    }
  })();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(`/exhibition?season=${season}`)}
            className="text-gray-400 hover:text-gray-900 transition-colors text-sm flex items-center gap-1"
          >
            ← 리더보드
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">
              {summary.player_name ?? playerId}
            </h1>
            {tc && (
              <span
                className="px-2 py-0.5 rounded border border-gray-200 text-xs font-semibold"
                style={{ color: teamColor(tc) }}
              >
                {teamName(tc)}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              isBatter
                ? 'bg-blue-50 text-blue-600 border border-blue-200'
                : 'bg-orange-50 text-orange-600 border border-orange-200'
            }`}>
              {isBatter ? '타자' : '투수'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          {badges.map(b => {
            const val = summary[b.key];
            if (val == null) return null;
            const display = b.fmt ? b.fmt(val as number) : String(val);
            return (
              <span
                key={b.key}
                className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm shadow-sm"
              >
                <span className="text-gray-400 mr-1.5">{b.label}</span>
                <span className="font-semibold text-gray-900">{display}</span>
              </span>
            );
          })}
        </div>

        {/* H2H comparison table */}
        {comparisonRows && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-3">성적 비교: 전체 vs 1군급</h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-gray-500 font-medium text-xs w-[100px]">지표</th>
                    <th className="px-4 py-2.5 text-right text-gray-500 font-medium text-xs w-[90px]">전체</th>
                    <th className="px-4 py-2.5 text-right text-blue-500 font-medium text-xs w-[90px] bg-blue-50/40 border-l-2 border-blue-200">vs 1군급</th>
                    <th className="px-4 py-2.5 text-right text-gray-400 font-medium text-xs w-[80px]">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map(row => {
                    const fmtVal = (v: number | null | undefined, display?: string | null) => {
                      if (display) return display;
                      if (v == null) return '-';
                      if (row.type === 'int') return String(v);
                      if (row.type === 'ip') return fmtIP(v);
                      if (row.type === 'rate2') return fmt2(v);
                      return fmt3(v);
                    };
                    const delta = row.type === 'rate' || row.type === 'rate2'
                      ? fmtDelta(row.overall, row.h2hVal, row.inverse)
                      : { text: '-', cls: 'text-gray-300' };
                    return (
                      <tr key={row.label} className="border-b border-gray-100 last:border-b-0">
                        <td className={`px-4 py-2 text-gray-600 ${row.bold ? 'font-bold' : 'font-medium'} text-xs`}>{row.label}</td>
                        <td className={`px-4 py-2 text-right tabular-nums font-mono ${row.bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{fmtVal(row.overall)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums font-mono bg-blue-50/40 border-l-2 border-blue-200 ${row.bold ? 'font-bold text-blue-600' : 'text-gray-700'}`}>
                          {fmtVal(row.h2hVal, (row as { h2hDisplay?: string }).h2hDisplay)}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums font-mono text-xs ${delta.cls}`}>{delta.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pitch mix - pitchers only */}
        {!isBatter && pitch_mix && pitch_mix.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-3">구종별 구속</h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-gray-500 font-medium text-xs">구종</th>
                    <th className="px-4 py-2.5 text-right text-gray-500 font-medium text-xs">투구수</th>
                    <th className="px-4 py-2.5 text-right text-gray-500 font-medium text-xs">비율</th>
                    <th className="px-4 py-2.5 text-right text-gray-500 font-medium text-xs">평균구속</th>
                    <th className="px-4 py-2.5 text-right text-gray-500 font-medium text-xs">최고구속</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const total = pitch_mix.reduce((s, r) => s + r.cnt, 0);
                    return pitch_mix.map(row => (
                      <tr key={row.pitch_type} className="border-b border-gray-100 last:border-b-0 hover:bg-blue-50/40">
                        <td className="px-4 py-2 text-gray-900 font-medium">{row.pitch_type}</td>
                        <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{row.cnt}</td>
                        <td className="px-4 py-2 text-right text-gray-500 tabular-nums">
                          {total > 0 ? `${((row.cnt / total) * 100).toFixed(1)}%` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right text-orange-600 font-mono font-semibold tabular-nums">{row.avg_speed}</td>
                        <td className="px-4 py-2 text-right text-red-500 font-mono font-semibold tabular-nums">{row.max_speed}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pitch zone distribution - pitchers only (Statcast grouped) */}
        {!isBatter && pitch_zones && pitch_zones.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-3">구종별 존 분포 & 디시플린<span className="text-gray-900 font-semibold ml-1">({summary.player_name ?? playerId})</span></h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-gray-500 font-medium text-xs">구종</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">투구</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">비율</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">평균</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">최고</th>
                    <th className="px-3 py-2.5 text-right text-blue-500 font-medium text-xs border-l border-gray-200">Zone%</th>
                    <th className="px-3 py-2.5 text-right text-blue-500 font-medium text-xs">Heart%</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs border-l border-gray-200">Swing%</th>
                    <th className="px-3 py-2.5 text-right text-amber-600 font-medium text-xs">Chase%</th>
                    <th className="px-3 py-2.5 text-right text-purple-600 font-medium text-xs border-l border-gray-200">Whiff%</th>
                    <th className="px-3 py-2.5 text-right text-blue-600 font-medium text-xs">W_Z</th>
                    <th className="px-3 py-2.5 text-right text-amber-700 font-medium text-xs">W_OZ</th>
                  </tr>
                </thead>
                <tbody>
                  {groupPitchTypes(pitch_zones).map(({ group, meta, items }) => (
                    <>
                      <tr key={`hdr-${group}`} className={`${meta.headerBg} border-b border-gray-200`}>
                        <td colSpan={12} className={`px-4 py-1.5 text-xs font-bold ${meta.color}`}>
                          {meta.label} <span className="font-normal text-gray-400 ml-1">{meta.labelEn}</span>
                        </td>
                      </tr>
                      {items.map(row => (
                        <tr key={row.pitch_type} className={`border-b border-gray-100 last:border-b-0 hover:${meta.bg}/60`}>
                          <td className={`px-4 py-2 font-medium ${meta.color}`}>{row.pitch_type}</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{row.cnt}</td>
                          <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                            {row.pct != null ? `${row.pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-orange-600 font-mono font-semibold tabular-nums">{row.avg_speed}</td>
                          <td className="px-3 py-2 text-right text-red-500 font-mono font-semibold tabular-nums">{row.max_speed}</td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${row.zone_pct >= 50 ? 'bg-blue-200' : row.zone_pct >= 40 ? 'bg-blue-100' : row.zone_pct >= 30 ? 'bg-blue-50' : ''}`}>
                            {row.zone_pct != null ? `${row.zone_pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${row.heart_pct >= 30 ? 'bg-blue-200' : row.heart_pct >= 20 ? 'bg-blue-100' : row.heart_pct >= 10 ? 'bg-blue-50' : ''}`}>
                            {row.heart_pct != null ? `${row.heart_pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${(row.swing_pct ?? 0) >= 55 ? 'bg-gray-200' : (row.swing_pct ?? 0) >= 45 ? 'bg-gray-100' : ''}`}>
                            {row.swing_pct != null ? `${row.swing_pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${(row.chase_rate ?? 0) >= 35 ? 'bg-amber-200 font-semibold' : (row.chase_rate ?? 0) >= 25 ? 'bg-amber-100' : (row.chase_rate ?? 0) >= 15 ? 'bg-amber-50' : ''}`}>
                            {row.chase_rate != null ? `${row.chase_rate.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${(row.whiff_pct ?? 0) >= 30 ? 'bg-purple-200 font-semibold' : (row.whiff_pct ?? 0) >= 20 ? 'bg-purple-100' : (row.whiff_pct ?? 0) >= 10 ? 'bg-purple-50' : ''}`}>
                            {row.whiff_pct != null ? `${row.whiff_pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${(row.whiff_z ?? 0) >= 20 ? 'bg-blue-100' : ''}`}>
                            {row.whiff_z != null ? `${row.whiff_z.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${(row.whiff_oz ?? 0) >= 40 ? 'bg-amber-200 font-semibold' : (row.whiff_oz ?? 0) >= 30 ? 'bg-amber-100' : ''}`}>
                            {row.whiff_oz != null ? `${row.whiff_oz.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Batter pitch discipline (Statcast grouped) */}
        {isBatter && batter_discipline && batter_discipline.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-3">구종별 피치 디시플린<span className="text-gray-900 font-semibold ml-1">({summary.player_name ?? playerId})</span></h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-gray-500 font-medium text-xs">구종</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">피칭</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">비율</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">평균</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">최고</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs border-l border-gray-200">Swing%</th>
                    <th className="px-3 py-2.5 text-right text-amber-600 font-medium text-xs">Chase%</th>
                    <th className="px-3 py-2.5 text-right text-purple-600 font-medium text-xs border-l border-gray-200">Whiff%</th>
                    <th className="px-3 py-2.5 text-right text-blue-600 font-medium text-xs">W_Z</th>
                    <th className="px-3 py-2.5 text-right text-amber-700 font-medium text-xs">W_OZ</th>
                  </tr>
                </thead>
                <tbody>
                  {groupPitchTypes(batter_discipline).map(({ group, meta, items }) => (
                    <>
                      <tr key={`bdr-${group}`} className={`${meta.headerBg} border-b border-gray-200`}>
                        <td colSpan={10} className={`px-4 py-1.5 text-xs font-bold ${meta.color}`}>
                          {meta.label} <span className="font-normal text-gray-400 ml-1">{meta.labelEn}</span>
                        </td>
                      </tr>
                      {items.map(row => (
                        <tr key={row.pitch_type} className={`border-b border-gray-100 last:border-b-0 hover:${meta.bg}/60`}>
                          <td className={`px-4 py-2 font-medium ${meta.color}`}>{row.pitch_type}</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{row.cnt}</td>
                          <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                            {row.pct != null ? `${row.pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-orange-600 font-mono font-semibold tabular-nums">{row.avg_speed}</td>
                          <td className="px-3 py-2 text-right text-red-500 font-mono font-semibold tabular-nums">{row.max_speed}</td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${(row.swing_pct ?? 0) >= 55 ? 'bg-gray-200' : (row.swing_pct ?? 0) >= 45 ? 'bg-gray-100' : ''}`}>
                            {row.swing_pct != null ? `${row.swing_pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${(row.chase_pct ?? 0) >= 35 ? 'bg-amber-200 font-semibold' : (row.chase_pct ?? 0) >= 25 ? 'bg-amber-100' : (row.chase_pct ?? 0) >= 15 ? 'bg-amber-50' : ''}`}>
                            {row.chase_pct != null ? `${row.chase_pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${(row.whiff_pct ?? 0) >= 30 ? 'bg-purple-200 font-semibold' : (row.whiff_pct ?? 0) >= 20 ? 'bg-purple-100' : (row.whiff_pct ?? 0) >= 10 ? 'bg-purple-50' : ''}`}>
                            {row.whiff_pct != null ? `${row.whiff_pct.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${(row.whiff_z ?? 0) >= 20 ? 'bg-blue-100' : ''}`}>
                            {row.whiff_z != null ? `${row.whiff_z.toFixed(1)}%` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${(row.whiff_oz ?? 0) >= 40 ? 'bg-amber-200 font-semibold' : (row.whiff_oz ?? 0) >= 30 ? 'bg-amber-100' : ''}`}>
                            {row.whiff_oz != null ? `${row.whiff_oz.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Velocity-based contact rate heatmap */}
        {isBatter && velocity_contact && velocity_contact.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-3">구속대별 컨택률<span className="text-gray-900 font-semibold ml-1">({summary.player_name ?? playerId})</span></h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-gray-500 font-medium text-xs">구속대</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs">투구</th>
                    <th className="px-3 py-2.5 text-right text-green-600 font-medium text-xs">Contact%</th>
                    <th className="px-3 py-2.5 text-right text-purple-600 font-medium text-xs">Whiff%</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs border-l border-gray-200">FB투구</th>
                    <th className="px-3 py-2.5 text-right text-green-600 font-medium text-xs">FB Contact%</th>
                    <th className="px-3 py-2.5 text-right text-purple-600 font-medium text-xs">FB Whiff%</th>
                  </tr>
                </thead>
                <tbody>
                  {velocity_contact.map(band => {
                    const lowSample = band.swings < 3;
                    const lowFbSample = band.fb_swings < 3;
                    return (
                      <tr key={band.velocity_band} className={`border-b border-gray-100 last:border-b-0 ${lowSample ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-2 font-medium text-gray-700 font-mono text-xs">{band.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{band.total}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${lowSample ? '' : (band.contact_pct ?? 0) >= 70 ? 'bg-green-200' : (band.contact_pct ?? 0) >= 60 ? 'bg-green-100' : ''}`}>
                          {lowSample ? '-' : band.contact_pct != null ? `${band.contact_pct.toFixed(1)}%` : '-'}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${lowSample ? '' : (band.whiff_pct ?? 0) >= 30 ? 'bg-purple-200 font-semibold' : (band.whiff_pct ?? 0) >= 20 ? 'bg-purple-100' : ''}`}>
                          {lowSample ? '-' : band.whiff_pct != null ? `${band.whiff_pct.toFixed(1)}%` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600 border-l border-gray-200">{band.fb_total}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${lowFbSample ? 'opacity-40' : (band.fb_contact_pct ?? 0) >= 70 ? 'bg-green-200' : (band.fb_contact_pct ?? 0) >= 60 ? 'bg-green-100' : ''}`}>
                          {lowFbSample ? '-' : band.fb_contact_pct != null ? `${band.fb_contact_pct.toFixed(1)}%` : '-'}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${lowFbSample ? 'opacity-40' : (band.fb_whiff_pct ?? 0) >= 30 ? 'bg-purple-200 font-semibold' : (band.fb_whiff_pct ?? 0) >= 20 ? 'bg-purple-100' : ''}`}>
                          {lowFbSample ? '-' : band.fb_whiff_pct != null ? `${band.fb_whiff_pct.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">3km/h 단위 · 스윙 3개 미만 구속대는 회색 처리 · FB = 직구/투심/싱커</p>
          </div>
        )}

        {/* Daily records */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-3">일별 기록</h2>

          {daily.length === 0 ? (
            <p className="text-gray-400 text-center py-8">기록이 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {daily.map(day => {
                const key = day.game_date;
                const open = expandedDays.has(key);
                const pas: PA[] = day.plate_appearances ?? [];

                return (
                  <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Day header */}
                    <button
                      onClick={() => toggleDay(key)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-wrap text-sm">
                        <span className="font-medium text-gray-900 w-[90px]">{formatDate(day.game_date)}</span>
                        {day.opponent && (
                          <span className="font-semibold w-[60px]" style={{ color: teamColor(day.opponent) }}>
                            vs {teamName(day.opponent)}
                          </span>
                        )}

                        {/* Batter day line */}
                        {isBatter && day.pa != null && (
                          <span className="text-gray-700 flex items-center gap-2">
                            <span className="font-mono">{day.hits ?? day.h ?? 0}/{day.ab ?? 0}</span>
                            {day.hr ? <span className="text-yellow-600">{day.hr}HR</span> : null}
                            {day.bb ? <span className="text-blue-500">{day.bb}BB</span> : null}
                            {day.so ? <span className="text-purple-500">{day.so}K</span> : null}
                            {day.avg != null && (
                              <span className="text-gray-400 text-xs">({fmt3(day.avg)})</span>
                            )}
                          </span>
                        )}

                        {/* Pitcher day line */}
                        {!isBatter && day.outs != null && (
                          <span className="text-gray-700 flex items-center gap-2">
                            <span className="font-mono">{fmtIP(day.ip)}IP</span>
                            {day.pa_against != null && <span className="text-gray-500">{day.pa_against}BF</span>}
                            {day.h_against != null && <span className="text-orange-500">{day.h_against}H</span>}
                            {day.so != null && day.so > 0 && <span className="text-purple-500">{day.so}K</span>}
                            {day.whip != null && (
                              <span className="text-gray-400 text-xs">(WHIP {fmt2(day.whip)})</span>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 text-xs ml-2 shrink-0">
                        {pas.length > 0 && <span className="mr-2 text-gray-300">{pas.length}PA</span>}
                        {open ? '▲' : '▼'}
                      </span>
                    </button>

                    {/* PA drill-down */}
                    {open && (
                      <div className="border-t border-gray-100">
                        {pas.length === 0 ? (
                          <p className="text-gray-400 text-sm px-4 py-3">타석 데이터 없음</p>
                        ) : (
                          <div className="divide-y divide-gray-50">
                            {pas.map((pa, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-3 px-4 py-2.5 text-xs flex-wrap hover:bg-blue-50/40"
                              >
                                <span className="text-gray-300 w-5 text-right font-mono">#{i + 1}</span>
                                <span className="text-gray-600 w-[52px]">
                                  {pa.inning}회{pa.inning_half?.toLowerCase() === 'bottom' ? '말' : '초'}
                                </span>
                                <span className="text-gray-400 w-[60px]">
                                  {pa.start_outs != null ? `${pa.start_outs}아웃` : ''}
                                </span>
                                <span className="text-gray-500 w-[72px] text-xs">
                                  {pa.runner_1b != null
                                    ? formatRunners(pa.runner_1b, pa.runner_2b ?? 0, pa.runner_3b ?? 0)
                                    : ''}
                                </span>
                                {(pa.opponent_pitcher_name || pa.opponent_batter_name) && (
                                  <span className="text-gray-500 w-[80px] truncate">
                                    vs {pa.opponent_pitcher_name || pa.opponent_batter_name}
                                  </span>
                                )}
                                <span className={`font-semibold min-w-[70px] ${resultColor(pa.result_type)}`}>
                                  {pa.result_type}
                                </span>
                                {pa.pitch_count != null && (
                                  <span className="text-gray-400">{pa.pitch_count}구</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
