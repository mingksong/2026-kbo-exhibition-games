import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PitcherProfileRow {
  pcode: string;
  name: string;
  team: string;
  is_foreign?: boolean;
  is_rookie?: boolean;
  ip: number;
  ip_display?: string;
  bf: number;
  so: number;
  bb: number;
  ra9?: number;
  pitch_types: number;
  max_speed: number;
  zone_pct: number;
  heart_pct: number;
  shadow_pct: number;
  chase_pct: number;
  waste_pct: number;
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

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt2 = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '--';
  return v.toFixed(2);
};

const fmtIP = (ip: number | null | undefined, display?: string): string => {
  if (display) return display;
  if (ip == null) return '-';
  const full = Math.floor(ip);
  const third = Math.round((ip - full) * 10);
  return `${full}.${third}`;
};

const fmtStat = (v: number | null | undefined): string => {
  if (v == null) return '-';
  return String(v);
};

const fmtPct = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '-';
  return v.toFixed(1) + '%';
};

// ─── Loading spinner ──────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
  </div>
);

// ─── Zone color helper ────────────────────────────────────────────────────────

const zoneColor = (type: 'zone' | 'heart' | 'shadow' | 'chase' | 'waste', val: number): string => {
  if (type === 'zone' || type === 'heart') {
    if (val >= 50) return 'bg-blue-200';
    if (val >= 40) return 'bg-blue-100';
    if (val >= 30) return 'bg-blue-50';
    return '';
  }
  if (type === 'shadow') {
    if (val >= 30) return 'bg-gray-200';
    if (val >= 20) return 'bg-gray-100';
    return '';
  }
  if (type === 'chase') {
    if (val >= 30) return 'bg-amber-200';
    if (val >= 20) return 'bg-amber-100';
    if (val >= 10) return 'bg-amber-50';
    return '';
  }
  // waste
  if (val >= 30) return 'bg-red-200';
  if (val >= 20) return 'bg-red-100';
  if (val >= 10) return 'bg-red-50';
  return '';
};

// ─── Columns ──────────────────────────────────────────────────────────────────

type SortOrder = 'asc' | 'desc';

const COLS: { key: string; label: string; defaultDesc?: boolean }[] = [
  { key: 'ip', label: 'IP', defaultDesc: true },
  { key: 'bf', label: 'BF' },
  { key: 'so', label: 'SO', defaultDesc: true },
  { key: 'bb', label: 'BB' },
  { key: 'ra9', label: 'RA9' },
  { key: 'pitch_types', label: '구종수', defaultDesc: true },
  { key: 'max_speed', label: '최고구속', defaultDesc: true },
  { key: 'zone_pct', label: 'Zone%', defaultDesc: true },
  { key: 'heart_pct', label: 'Heart%', defaultDesc: true },
  { key: 'shadow_pct', label: 'Shadow%', defaultDesc: true },
  { key: 'chase_pct', label: 'Chase%', defaultDesc: true },
  { key: 'waste_pct', label: 'Waste%', defaultDesc: true },
];

// ─── Sub-navigation ───────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { path: '/exhibition', label: '리더보드' },
  { path: '/exhibition/pitcher-profiler', label: '투수 프로파일' },
  { path: '/exhibition/prospects', label: '유망주 발굴' },
  { path: '/exhibition/velocity-contact', label: '구속 컨택' },
];

// ─── Client-side sort helper ──────────────────────────────────────────────────

function sortRows<T>(rows: T[], key: keyof T, order: SortOrder): T[] {
  return [...rows].sort((a, b) => {
    const av = a[key] as number | null | undefined;
    const bv = b[key] as number | null | undefined;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return order === 'desc' ? bv - av : av - bv;
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExhibitionPitcherProfiler() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(0);
  const [isForeign, setIsForeign] = useState<boolean | null>(null);
  const [isRookie, setIsRookie] = useState<boolean>(false);
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [minPitches, setMinPitches] = useState<number>(30);
  const [sortBy, setSortBy] = useState<string>('zone_pct');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [allPitchers, setAllPitchers] = useState<PitcherProfileRow[]>([]);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { document.title = '투수 프로파일 | BallTology'; }, []);

  // Load seasons
  useEffect(() => {
    fetch('/data/seasons.json')
      .then(r => r.json())
      .then(data => {
        const list: number[] = data.seasons ?? [];
        setSeasons(list);
        if (list.length > 0) setSeason(list[0]);
      })
      .catch(() => setSeasons([]));
  }, []);

  // Load pitcher data when season or filterTeam changes
  useEffect(() => {
    if (!season) return;
    setLoading(true);
    const url = filterTeam
      ? `/data/pitcher-profiles-${filterTeam}.json`
      : '/data/pitcher-profiles.json';
    fetch(url)
      .then(r => r.json())
      .then(data => setAllPitchers(data.pitchers ?? []))
      .catch(() => setAllPitchers([]))
      .finally(() => setLoading(false));
  }, [season, filterTeam]);

  // Client-side filter + sort
  const pitchers = useMemo(() => {
    let filtered = [...allPitchers];

    if (isRookie) {
      filtered = filtered.filter(p => p.is_rookie === true);
    } else if (isForeign === true) {
      filtered = filtered.filter(p => p.is_foreign === true);
    } else if (isForeign === false) {
      filtered = filtered.filter(p => !p.is_foreign);
    }

    // min_pitches filter — use bf as proxy for total pitches seen
    filtered = filtered.filter(p => p.bf >= minPitches);

    return sortRows(filtered, sortBy as keyof PitcherProfileRow, sortOrder);
  }, [allPitchers, isForeign, isRookie, minPitches, sortBy, sortOrder]);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(o => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      const col = COLS.find(c => c.key === key);
      setSortBy(key);
      setSortOrder(col?.defaultDesc ? 'desc' : 'asc');
    }
  };

  const handleRowClick = (pcode: string) => {
    navigate(`/exhibition/${pcode}?season=${season}`);
  };

  // ── Sort indicator ─────────────────────────────────────────────────────────
  const SortIcon = ({ col, active, order }: { col: string; active: string; order: SortOrder }) => {
    if (col !== active) return <span className="ml-0.5 text-gray-300">↕</span>;
    return <span className="ml-0.5 text-blue-500">{order === 'desc' ? '↓' : '↑'}</span>;
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const thCls = "px-2 py-2.5 text-right text-gray-500 font-medium cursor-pointer hover:text-blue-600 select-none whitespace-nowrap text-xs";
  const tdNum = "px-2 py-2 text-right text-gray-700 tabular-nums text-sm whitespace-nowrap";
  const tdMono = "px-2 py-2 text-right font-mono text-gray-600 text-sm whitespace-nowrap";

  // ── Render table ───────────────────────────────────────────────────────────
  const renderTable = () => {
    if (loading) return <Spinner />;
    if (pitchers.length === 0)
      return <p className="text-center text-gray-400 py-12">데이터가 없습니다</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50 sticky top-0 z-10">
              <th className="px-2 py-2.5 text-center text-gray-500 font-medium text-xs w-10 whitespace-nowrap">#</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[100px]">선수</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[52px]">팀</th>
              {COLS.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} className={thCls}>
                  {col.label}<SortIcon col={col.key} active={sortBy} order={sortOrder} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pitchers.map((p, idx) => (
              <tr
                key={p.pcode}
                onClick={() => handleRowClick(p.pcode)}
                className="border-b border-gray-100 cursor-pointer transition-colors hover:bg-blue-50/60"
              >
                <td className="px-2 py-2 text-center text-gray-400 text-sm">{idx + 1}</td>
                <td className="px-2 py-2 font-semibold text-gray-900 text-sm whitespace-nowrap">
                  {p.name}
                  {p.is_foreign && <span className="ml-1 text-[10px] text-orange-500 font-normal">외</span>}
                </td>
                <td className="px-2 py-2 text-sm font-semibold whitespace-nowrap" style={{ color: teamColor(p.team) }}>
                  {teamName(p.team)}
                </td>
                <td className={tdMono}>{fmtIP(p.ip, p.ip_display)}</td>
                <td className={tdNum}>{fmtStat(p.bf)}</td>
                <td className={tdNum}>{fmtStat(p.so)}</td>
                <td className={tdNum}>{fmtStat(p.bb)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-red-500 text-sm whitespace-nowrap">{fmt2(p.ra9)}</td>
                <td className={tdNum}>{fmtStat(p.pitch_types)}</td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-orange-600 text-sm whitespace-nowrap">{fmtStat(p.max_speed)}</td>
                <td className={`px-2 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums ${zoneColor('zone', p.zone_pct)}`}>
                  {fmtPct(p.zone_pct)}
                </td>
                <td className={`px-2 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums ${zoneColor('heart', p.heart_pct)}`}>
                  {fmtPct(p.heart_pct)}
                </td>
                <td className={`px-2 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums ${zoneColor('shadow', p.shadow_pct)}`}>
                  {fmtPct(p.shadow_pct)}
                </td>
                <td className={`px-2 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums ${zoneColor('chase', p.chase_pct)}`}>
                  {fmtPct(p.chase_pct)}
                </td>
                <td className={`px-2 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums ${zoneColor('waste', p.waste_pct)}`}>
                  {fmtPct(p.waste_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">투수 프로파일</h1>
            <p className="text-xs text-gray-400">Pitcher Profiler</p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <select
              value={season}
              onChange={e => setSeason(Number(e.target.value))}
              className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            >
              {seasons.map(s => (
                <option key={s} value={s}>{s}년</option>
              ))}
            </select>

            <select
              value={filterTeam}
              onChange={e => setFilterTeam(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            >
              <option value="">전체 구단</option>
              {Object.entries(TEAM_NAME).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>

            <button
              onClick={() => {
                setIsRookie(false);
                setIsForeign(prev => {
                  if (prev === null) return true;
                  if (prev === true) return false;
                  return null;
                });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                isForeign === true && !isRookie
                  ? 'bg-orange-50 border-orange-400 text-orange-600'
                  : isForeign === false && !isRookie
                    ? 'bg-gray-50 border-gray-400 text-gray-600'
                    : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
              }`}
            >
              외국인 {isForeign === true && !isRookie ? '만' : isForeign === false && !isRookie ? '제외' : '전체'}
            </button>

            <button
              onClick={() => {
                setIsRookie(prev => !prev);
                if (!isRookie) setIsForeign(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                isRookie
                  ? 'bg-green-50 border-green-400 text-green-600'
                  : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
              }`}
            >
              신인
            </button>

            <label className="flex items-center gap-1.5 text-sm text-gray-500">
              최소투구
              <input
                type="number" min={0} value={minPitches}
                onChange={e => setMinPitches(Number(e.target.value))}
                className="w-14 bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 text-sm focus:outline-none focus:border-blue-400"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {/* Sub-navigation */}
        <div className="flex gap-1 border-b border-gray-200">
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                location.pathname === item.path ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {item.label}
              {location.pathname === item.path && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {renderTable()}
        </div>

        {!loading && (
          <p className="text-xs text-gray-400 text-right">
            {pitchers.length}명 표시
          </p>
        )}
      </div>
    </div>
  );
}
