import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProspectBatterRow {
  pcode: string;
  name: string;
  team: string;
  is_foreign?: boolean;
  draft?: string;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  bb: number;
  so: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  h2h_pa: number;
  h2h_ab: number;
  h2h_h: number;
  h2h_hr: number;
  h2h_bb: number;
  h2h_so: number;
  h2h_avg: number | null;
  h2h_obp: number | null;
  h2h_slg: number | null;
  h2h_ops: number | null;
}

interface ProspectPitcherRow {
  pcode: string;
  name: string;
  team: string;
  is_foreign?: boolean;
  draft?: string;
  bf: number;
  ip: number;
  ip_display?: string;
  h: number;
  bb: number;
  so: number;
  ra9: number | null;
  baa: number | null;
  whip: number | null;
  h2h_bf: number;
  h2h_so: number;
  h2h_bb: number;
  h2h_baa: number | null;
  h2h_ops_against: number | null;
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

const fmt3 = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '.---';
  return v.toFixed(3).replace(/^0/, '');
};

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

const formatDraft = (draft?: string): string => {
  if (!draft) return '-';
  const parts = draft.split('-');
  if (parts.length < 2) return draft;
  const round = parseInt(parts[0].slice(2)) || 0;
  const pick = parseInt(parts[1]) || 0;
  if (round === 0 && pick === 0) return draft;
  return `${round}R ${pick}순위`;
};

// ─── Loading spinner ──────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
  </div>
);

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { path: '/exhibition', label: '리더보드' },
  { path: '/exhibition/pitcher-profiler', label: '투수 프로파일' },
  { path: '/exhibition/prospects', label: '유망주 발굴' },
  { path: '/exhibition/velocity-contact', label: '구속 컨택' },
];

// ─── Column definitions ───────────────────────────────────────────────────────

const BATTER_COLS: { key: string; label: string; defaultDesc?: boolean; h2h?: boolean }[] = [
  { key: 'pa', label: 'PA' },
  { key: 'h', label: 'H' },
  { key: 'hr', label: 'HR' },
  { key: 'bb', label: 'BB' },
  { key: 'so', label: 'SO' },
  { key: 'avg', label: 'AVG', defaultDesc: true },
  { key: 'obp', label: 'OBP', defaultDesc: true },
  { key: 'slg', label: 'SLG', defaultDesc: true },
  { key: 'ops', label: 'OPS', defaultDesc: true },
  { key: 'h2h_pa', label: 'PA', h2h: true },
  { key: 'h2h_avg', label: 'AVG', defaultDesc: true, h2h: true },
  { key: 'h2h_obp', label: 'OBP', defaultDesc: true, h2h: true },
  { key: 'h2h_slg', label: 'SLG', defaultDesc: true, h2h: true },
  { key: 'h2h_ops', label: 'OPS', defaultDesc: true, h2h: true },
];

const PITCHER_COLS: { key: string; label: string; defaultDesc?: boolean; h2h?: boolean }[] = [
  { key: 'bf', label: 'BF' },
  { key: 'ip', label: 'IP', defaultDesc: true },
  { key: 'so', label: 'SO', defaultDesc: true },
  { key: 'bb', label: 'BB' },
  { key: 'ra9', label: 'RA9' },
  { key: 'baa', label: 'BAA' },
  { key: 'whip', label: 'WHIP' },
  { key: 'h2h_bf', label: 'BF', h2h: true },
  { key: 'h2h_so', label: 'SO', defaultDesc: true, h2h: true },
  { key: 'h2h_bb', label: 'BB', h2h: true },
  { key: 'h2h_baa', label: 'BAA', h2h: true },
  { key: 'h2h_ops_against', label: 'OPS', defaultDesc: true, h2h: true },
];

const BATTER_REGULAR_COLS = BATTER_COLS.filter(c => !c.h2h);
const BATTER_H2H_COLS = BATTER_COLS.filter(c => c.h2h);
const PITCHER_REGULAR_COLS = PITCHER_COLS.filter(c => !c.h2h);
const PITCHER_H2H_COLS = PITCHER_COLS.filter(c => c.h2h);

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

type Tab = 'batters' | 'pitchers';
type SortOrder = 'asc' | 'desc';

export default function ExhibitionProspects() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<Tab>('batters');
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(0);
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [minPa, setMinPa] = useState<number>(5);
  const [minBf, setMinBf] = useState<number>(5);

  const [batterSortBy, setBatterSortBy] = useState<string>('ops');
  const [batterSortOrder, setBatterSortOrder] = useState<SortOrder>('desc');
  const [pitcherSortBy, setPitcherSortBy] = useState<string>('ra9');
  const [pitcherSortOrder, setPitcherSortOrder] = useState<SortOrder>('asc');

  const [allBatters, setAllBatters] = useState<ProspectBatterRow[]>([]);
  const [allPitchers, setAllPitchers] = useState<ProspectPitcherRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = '유망주 발굴 | BallTology'; }, []);

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

  // Load batter data when season or filterTeam changes
  useEffect(() => {
    if (!season) return;
    setLoading(true);
    const url = filterTeam
      ? `/data/prospects-batters-${filterTeam}.json`
      : '/data/prospects-batters.json';
    fetch(url)
      .then(r => r.json())
      .then(data => setAllBatters(data.batters ?? []))
      .catch(() => setAllBatters([]))
      .finally(() => setLoading(false));
  }, [season, filterTeam]);

  // Load pitcher data when season or filterTeam changes
  useEffect(() => {
    if (!season) return;
    setLoading(true);
    const url = filterTeam
      ? `/data/prospects-pitchers-${filterTeam}.json`
      : '/data/prospects-pitchers.json';
    fetch(url)
      .then(r => r.json())
      .then(data => setAllPitchers(data.pitchers ?? []))
      .catch(() => setAllPitchers([]))
      .finally(() => setLoading(false));
  }, [season, filterTeam]);

  // Client-side filter + sort for batters
  const batters = useMemo(() => {
    const filtered = allBatters.filter(p => p.pa >= minPa);
    return sortRows(filtered, batterSortBy as keyof ProspectBatterRow, batterSortOrder);
  }, [allBatters, minPa, batterSortBy, batterSortOrder]);

  // Client-side filter + sort for pitchers
  const pitchers = useMemo(() => {
    const filtered = allPitchers.filter(p => p.bf >= minBf);
    return sortRows(filtered, pitcherSortBy as keyof ProspectPitcherRow, pitcherSortOrder);
  }, [allPitchers, minBf, pitcherSortBy, pitcherSortOrder]);

  const handleBatterSort = (key: string) => {
    if (batterSortBy === key) {
      setBatterSortOrder(o => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      const col = BATTER_COLS.find(c => c.key === key);
      setBatterSortBy(key);
      setBatterSortOrder(col?.defaultDesc ? 'desc' : 'asc');
    }
  };

  const handlePitcherSort = (key: string) => {
    if (pitcherSortBy === key) {
      setPitcherSortOrder(o => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      const col = PITCHER_COLS.find(c => c.key === key);
      setPitcherSortBy(key);
      setPitcherSortOrder(col?.defaultDesc ? 'desc' : 'asc');
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
  const thH2hCls = "px-2 py-2.5 text-right text-blue-500 font-medium cursor-pointer hover:text-blue-700 select-none whitespace-nowrap text-xs bg-blue-50/40";
  const tdNum = "px-2 py-2 text-right text-gray-700 tabular-nums text-sm whitespace-nowrap";
  const tdMono = "px-2 py-2 text-right font-mono text-gray-600 text-sm whitespace-nowrap";

  // ── Render batter table ────────────────────────────────────────────────────
  const renderBatterTable = () => {
    if (loading) return <Spinner />;
    if (batters.length === 0)
      return <p className="text-center text-gray-400 py-12">데이터가 없습니다</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Group header row — NOT sticky */}
            <tr className="bg-gray-50 border-b border-gray-100">
              <th colSpan={4} />
              <th colSpan={BATTER_REGULAR_COLS.length} className="px-2 py-1 text-center text-xs text-gray-400 font-normal">전체 성적</th>
              <th colSpan={BATTER_H2H_COLS.length} className="px-2 py-1 text-center text-xs text-blue-500 font-medium border-l-2 border-blue-200 bg-blue-50/40">vs 1군급</th>
            </tr>
            {/* Sort header row — sticky */}
            <tr className="border-b-2 border-gray-200 bg-gray-50 sticky top-0 z-10">
              <th className="px-2 py-2.5 text-center text-gray-500 font-medium text-xs w-10 whitespace-nowrap">#</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[100px]">선수</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[52px]">팀</th>
              <th className="px-2 py-2.5 text-left text-gray-400 font-normal text-xs whitespace-nowrap">드래프트</th>
              {BATTER_REGULAR_COLS.map(col => (
                <th key={col.key} onClick={() => handleBatterSort(col.key)} className={thCls}>
                  {col.label}<SortIcon col={col.key} active={batterSortBy} order={batterSortOrder} />
                </th>
              ))}
              {BATTER_H2H_COLS.map((col, i) => (
                <th
                  key={col.key}
                  onClick={() => handleBatterSort(col.key)}
                  className={`${thH2hCls}${i === 0 ? ' border-l-2 border-blue-200' : ''}`}
                >
                  {col.label}<SortIcon col={col.key} active={batterSortBy} order={batterSortOrder} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batters.map((p, idx) => (
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
                <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{formatDraft(p.draft)}</td>
                <td className={tdNum}>{fmtStat(p.pa)}</td>
                <td className={tdNum}>{fmtStat(p.h)}</td>
                <td className={tdNum}>{fmtStat(p.hr)}</td>
                <td className={tdNum}>{fmtStat(p.bb)}</td>
                <td className={tdNum}>{fmtStat(p.so)}</td>
                <td className={tdMono}>{fmt3(p.avg)}</td>
                <td className={tdMono}>{fmt3(p.obp)}</td>
                <td className={tdMono}>{fmt3(p.slg)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-blue-600 text-sm whitespace-nowrap">{fmt3(p.ops)}</td>
                {/* H2H columns */}
                <td className="px-2 py-2 text-right text-gray-700 tabular-nums text-sm whitespace-nowrap border-l-2 border-blue-200 bg-blue-50/40">{fmtStat(p.h2h_pa)}</td>
                <td className="px-2 py-2 text-right font-mono text-gray-600 text-sm whitespace-nowrap bg-blue-50/40">{fmt3(p.h2h_avg)}</td>
                <td className="px-2 py-2 text-right font-mono text-gray-600 text-sm whitespace-nowrap bg-blue-50/40">{fmt3(p.h2h_obp)}</td>
                <td className="px-2 py-2 text-right font-mono text-gray-600 text-sm whitespace-nowrap bg-blue-50/40">{fmt3(p.h2h_slg)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-blue-600 text-sm whitespace-nowrap bg-blue-50/40">{fmt3(p.h2h_ops)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Render pitcher table ───────────────────────────────────────────────────
  const renderPitcherTable = () => {
    if (loading) return <Spinner />;
    if (pitchers.length === 0)
      return <p className="text-center text-gray-400 py-12">데이터가 없습니다</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Group header row — NOT sticky */}
            <tr className="bg-gray-50 border-b border-gray-100">
              <th colSpan={4} />
              <th colSpan={PITCHER_REGULAR_COLS.length} className="px-2 py-1 text-center text-xs text-gray-400 font-normal">전체 성적</th>
              <th colSpan={PITCHER_H2H_COLS.length} className="px-2 py-1 text-center text-xs text-blue-500 font-medium border-l-2 border-blue-200 bg-blue-50/40">vs 1군급</th>
            </tr>
            {/* Sort header row — sticky */}
            <tr className="border-b-2 border-gray-200 bg-gray-50 sticky top-0 z-10">
              <th className="px-2 py-2.5 text-center text-gray-500 font-medium text-xs w-10 whitespace-nowrap">#</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[100px]">선수</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[52px]">팀</th>
              <th className="px-2 py-2.5 text-left text-gray-400 font-normal text-xs whitespace-nowrap">드래프트</th>
              {PITCHER_REGULAR_COLS.map(col => (
                <th key={col.key} onClick={() => handlePitcherSort(col.key)} className={thCls}>
                  {col.label}<SortIcon col={col.key} active={pitcherSortBy} order={pitcherSortOrder} />
                </th>
              ))}
              {PITCHER_H2H_COLS.map((col, i) => (
                <th
                  key={col.key}
                  onClick={() => handlePitcherSort(col.key)}
                  className={`${thH2hCls}${i === 0 ? ' border-l-2 border-blue-200' : ''}`}
                >
                  {col.label}<SortIcon col={col.key} active={pitcherSortBy} order={pitcherSortOrder} />
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
                <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{formatDraft(p.draft)}</td>
                <td className={tdNum}>{fmtStat(p.bf)}</td>
                <td className={tdMono}>{fmtIP(p.ip, p.ip_display)}</td>
                <td className={tdNum}>{fmtStat(p.so)}</td>
                <td className={tdNum}>{fmtStat(p.bb)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-red-500 text-sm whitespace-nowrap">{fmt2(p.ra9)}</td>
                <td className={tdMono}>{fmt3(p.baa)}</td>
                <td className={tdMono}>{fmt2(p.whip)}</td>
                {/* H2H columns */}
                <td className="px-2 py-2 text-right text-gray-700 tabular-nums text-sm whitespace-nowrap border-l-2 border-blue-200 bg-blue-50/40">{fmtStat(p.h2h_bf)}</td>
                <td className="px-2 py-2 text-right text-gray-700 tabular-nums text-sm whitespace-nowrap bg-blue-50/40">{fmtStat(p.h2h_so)}</td>
                <td className="px-2 py-2 text-right text-gray-700 tabular-nums text-sm whitespace-nowrap bg-blue-50/40">{fmtStat(p.h2h_bb)}</td>
                <td className="px-2 py-2 text-right font-mono text-gray-600 text-sm whitespace-nowrap bg-blue-50/40">{fmt3(p.h2h_baa)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-blue-600 text-sm whitespace-nowrap bg-blue-50/40">{fmt3(p.h2h_ops_against)}</td>
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
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">유망주 발굴</h1>
            <p className="text-xs text-gray-400">Prospect Finder</p>
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

            {activeTab === 'batters' ? (
              <label className="flex items-center gap-1.5 text-sm text-gray-500">
                최소PA
                <input
                  type="number" min={0} value={minPa}
                  onChange={e => setMinPa(Number(e.target.value))}
                  className="w-14 bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 text-sm focus:outline-none focus:border-blue-400"
                />
              </label>
            ) : (
              <label className="flex items-center gap-1.5 text-sm text-gray-500">
                최소BF
                <input
                  type="number" min={0} value={minBf}
                  onChange={e => setMinBf(Number(e.target.value))}
                  className="w-14 bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 text-sm focus:outline-none focus:border-blue-400"
                />
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {/* Sub-navigation */}
        <div className="flex gap-1 border-b border-gray-200">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/exhibition' && location.pathname.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* Batter / Pitcher tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {(['batters', 'pitchers'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab === 'batters' ? '타자' : '투수'}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {activeTab === 'batters' ? renderBatterTable() : renderPitcherTable()}
        </div>

        {!loading && (
          <p className="text-xs text-gray-400 text-right">
            {activeTab === 'batters' ? `${batters.length}명` : `${pitchers.length}명`} 표시
          </p>
        )}
      </div>
    </div>
  );
}
