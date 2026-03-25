import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatterRow {
  pcode: string;
  name: string;
  team: string;
  pa: number;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  so: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  is_foreign?: boolean;
  draft?: string;
}

interface PitcherRow {
  pcode: string;
  name: string;
  team: string;
  ip: number;
  ip_display?: string;
  bf: number;
  h: number;
  hr: number;
  bb: number;
  so: number;
  baa: number;
  whip: number;
  k_bb: number;
  ra9?: number;
  is_foreign?: boolean;
  draft?: string;
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

// ─── Loading spinner ──────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

type Tab = 'batters' | 'pitchers';
type SortOrder = 'asc' | 'desc';

const BATTER_COLS: { key: string; label: string; defaultDesc?: boolean }[] = [
  { key: 'pa', label: 'PA' },
  { key: 'ab', label: 'AB' },
  { key: 'h', label: 'H' },
  { key: 'doubles', label: '2B' },
  { key: 'triples', label: '3B' },
  { key: 'hr', label: 'HR' },
  { key: 'bb', label: 'BB' },
  { key: 'so', label: 'SO' },
  { key: 'avg', label: 'AVG', defaultDesc: true },
  { key: 'obp', label: 'OBP', defaultDesc: true },
  { key: 'slg', label: 'SLG', defaultDesc: true },
  { key: 'ops', label: 'OPS', defaultDesc: true },
];

const PITCHER_COLS: { key: string; label: string; defaultDesc?: boolean }[] = [
  { key: 'ip', label: 'IP', defaultDesc: true },
  { key: 'bf', label: 'BF' },
  { key: 'h', label: 'H' },
  { key: 'hr', label: 'HR' },
  { key: 'bb', label: 'BB' },
  { key: 'so', label: 'SO', defaultDesc: true },
  { key: 'baa', label: 'BAA' },
  { key: 'whip', label: 'WHIP' },
  { key: 'k_bb', label: 'K/BB', defaultDesc: true },
  { key: 'ra9', label: 'RA9' },
];

export default function ExhibitionLeaderboard() {
  const [activeTab, setActiveTab] = useState<Tab>('batters');
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(0);
  const [isForeign, setIsForeign] = useState<boolean | null>(null);
  const [isRookie, setIsRookie] = useState<boolean>(false);
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [minPa, setMinPa] = useState<number>(10);
  const [minOuts, setMinOuts] = useState<number>(0);

  const [batterSortBy, setBatterSortBy] = useState<string>('ops');
  const [batterSortOrder, setBatterSortOrder] = useState<SortOrder>('desc');
  const [pitcherSortBy, setPitcherSortBy] = useState<string>('ra9');
  const [pitcherSortOrder, setPitcherSortOrder] = useState<SortOrder>('asc');

  // Raw data loaded from static JSON
  const [allBatters, setAllBatters] = useState<BatterRow[]>([]);
  const [allPitchers, setAllPitchers] = useState<PitcherRow[]>([]);
  const [loadingBatters, setLoadingBatters] = useState(false);
  const [loadingPitchers, setLoadingPitchers] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const NAV_ITEMS = [
    { path: '/exhibition', label: '리더보드' },
    { path: '/exhibition/pitcher-profiler', label: '투수 프로파일' },
    { path: '/exhibition/prospects', label: '유망주 발굴' },
    { path: '/exhibition/velocity-contact', label: '구속 컨택' },
  ];

  useEffect(() => { document.title = '시범경기 리더보드 | BallTology'; }, []);

  // Load seasons from static JSON
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

  // Load batters when season or team filter changes
  useEffect(() => {
    if (!season) return;
    setLoadingBatters(true);
    const url = filterTeam ? `/data/batters-${filterTeam}.json` : '/data/batters.json';
    fetch(url)
      .then(r => r.json())
      .then(data => setAllBatters(data.batters ?? []))
      .catch(() => setAllBatters([]))
      .finally(() => setLoadingBatters(false));
  }, [season, filterTeam]);

  // Load pitchers when season or team filter changes
  useEffect(() => {
    if (!season) return;
    setLoadingPitchers(true);
    const url = filterTeam ? `/data/pitchers-${filterTeam}.json` : '/data/pitchers.json';
    fetch(url)
      .then(r => r.json())
      .then(data => setAllPitchers(data.pitchers ?? []))
      .catch(() => setAllPitchers([]))
      .finally(() => setLoadingPitchers(false));
  }, [season, filterTeam]);

  // Derived batter list: client-side filter + sort
  const batters = useMemo(() => {
    let filtered = [...allBatters];
    if (isRookie) {
      const rookiePrefix = String(season % 100).padStart(2, '0');
      filtered = filtered.filter(b => !b.is_foreign && b.draft?.startsWith(rookiePrefix));
    } else if (isForeign !== null) {
      filtered = filtered.filter(b => b.is_foreign === isForeign);
    }
    if (minPa > 0) filtered = filtered.filter(b => b.pa >= minPa);
    filtered.sort((a, b) => {
      const av = (a as any)[batterSortBy] ?? 0;
      const bv = (b as any)[batterSortBy] ?? 0;
      return batterSortOrder === 'desc' ? bv - av : av - bv;
    });
    return filtered;
  }, [allBatters, batterSortBy, batterSortOrder, isForeign, isRookie, minPa, season]);

  // Derived pitcher list: client-side filter + sort
  const pitchers = useMemo(() => {
    let filtered = [...allPitchers];
    if (isRookie) {
      const rookiePrefix = String(season % 100).padStart(2, '0');
      filtered = filtered.filter(p => !p.is_foreign && p.draft?.startsWith(rookiePrefix));
    } else if (isForeign !== null) {
      filtered = filtered.filter(p => p.is_foreign === isForeign);
    }
    if (minOuts > 0) {
      // ip stored as decimal (e.g. 3.2 = 3 innings + 2 outs); convert to total outs
      filtered = filtered.filter(p => {
        const full = Math.floor(p.ip);
        const frac = Math.round((p.ip - full) * 10);
        return full * 3 + frac >= minOuts;
      });
    }
    filtered.sort((a, b) => {
      const av = (a as any)[pitcherSortBy] ?? 0;
      const bv = (b as any)[pitcherSortBy] ?? 0;
      return pitcherSortOrder === 'desc' ? bv - av : av - bv;
    });
    return filtered;
  }, [allPitchers, pitcherSortBy, pitcherSortOrder, isForeign, isRookie, minOuts, season]);

  const loadingList = activeTab === 'batters' ? loadingBatters : loadingPitchers;

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
  const tdNum = "px-2 py-2 text-right text-gray-700 tabular-nums text-sm whitespace-nowrap";
  const tdMono = "px-2 py-2 text-right font-mono text-gray-600 text-sm whitespace-nowrap";

  // ── Render batter table ────────────────────────────────────────────────────
  const renderBatterTable = () => {
    if (loadingBatters) return <Spinner />;
    if (batters.length === 0)
      return <p className="text-center text-gray-400 py-12">데이터가 없습니다</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50 sticky top-0 z-10">
              <th className="px-2 py-2.5 text-center text-gray-500 font-medium text-xs w-10 whitespace-nowrap">#</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[100px]">선수</th>
              <th className="px-2 py-2.5 text-left text-gray-500 font-medium text-xs w-[52px]">팀</th>
              {BATTER_COLS.map(col => (
                <th key={col.key} onClick={() => handleBatterSort(col.key)} className={thCls}>
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
                <td className={tdNum}>{fmtStat(p.pa)}</td>
                <td className={tdNum}>{fmtStat(p.ab)}</td>
                <td className={tdNum}>{fmtStat(p.h)}</td>
                <td className={tdNum}>{fmtStat(p.doubles)}</td>
                <td className={tdNum}>{fmtStat(p.triples)}</td>
                <td className={tdNum}>{fmtStat(p.hr)}</td>
                <td className={tdNum}>{fmtStat(p.bb)}</td>
                <td className={tdNum}>{fmtStat(p.so)}</td>
                <td className={tdMono}>{fmt3(p.avg)}</td>
                <td className={tdMono}>{fmt3(p.obp)}</td>
                <td className={tdMono}>{fmt3(p.slg)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-blue-600 text-sm whitespace-nowrap">{fmt3(p.ops)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Render pitcher table ───────────────────────────────────────────────────
  const renderPitcherTable = () => {
    if (loadingPitchers) return <Spinner />;
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
              {PITCHER_COLS.map(col => (
                <th key={col.key} onClick={() => handlePitcherSort(col.key)} className={thCls}>
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
                <td className={`${tdMono}`}>{fmtIP(p.ip, p.ip_display)}</td>
                <td className={tdNum}>{fmtStat(p.bf)}</td>
                <td className={tdNum}>{fmtStat(p.h)}</td>
                <td className={tdNum}>{fmtStat(p.hr)}</td>
                <td className={tdNum}>{fmtStat(p.bb)}</td>
                <td className={tdNum}>{fmtStat(p.so)}</td>
                <td className={tdMono}>{fmt3(p.baa)}</td>
                <td className={tdMono}>{fmt2(p.whip)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-blue-600 text-sm whitespace-nowrap">{fmt2(p.k_bb)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-red-500 text-sm whitespace-nowrap">{fmt2(p.ra9)}</td>
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
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">시범경기 리더보드</h1>
            <p className="text-xs text-gray-400">Exhibition Stats</p>
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
                최소아웃
                <input
                  type="number" min={0} value={minOuts}
                  onChange={e => setMinOuts(Number(e.target.value))}
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

        {/* Tabs */}
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

        {!loadingList && (
          <p className="text-xs text-gray-400 text-right">
            {activeTab === 'batters' ? `${batters.length}명` : `${pitchers.length}명`} 표시
          </p>
        )}
      </div>
    </div>
  );
}
