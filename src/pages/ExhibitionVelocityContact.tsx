import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VeloContactRow {
  pcode: string;
  name: string;
  team: string;
  is_foreign?: boolean;
  total_pitches: number;
  fb_swings: number;
  fb_contact_pct: number | null;
  fb_whiff_pct: number | null;
  hi_swings: number;
  hi_velo_fb_whiff_pct: number | null;
  lo_swings: number;
  lo_velo_fb_whiff_pct: number | null;
  velo_whiff_diff: number | null;
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

const fmtPct = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '-';
  return v.toFixed(1) + '%';
};

const fmtDiff = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '-';
  return (v > 0 ? '+' : '') + v.toFixed(1);
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

type SortKey = 'name' | 'team' | 'total_pitches' | 'fb_contact_pct' | 'fb_whiff_pct' | 'hi_velo_fb_whiff_pct' | 'lo_velo_fb_whiff_pct' | 'velo_whiff_diff';

const COLUMNS: { key: SortKey; label: string; defaultDesc?: boolean }[] = [
  { key: 'total_pitches', label: '직구수', defaultDesc: true },
  { key: 'fb_contact_pct', label: 'FB Contact%', defaultDesc: true },
  { key: 'fb_whiff_pct', label: 'FB Whiff%', defaultDesc: true },
  { key: 'hi_velo_fb_whiff_pct', label: '고속(147+) Whiff%', defaultDesc: false },
  { key: 'lo_velo_fb_whiff_pct', label: '저속(~146) Whiff%', defaultDesc: false },
  { key: 'velo_whiff_diff', label: '차이', defaultDesc: true },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExhibitionVelocityContact() {
  const navigate = useNavigate();
  const location = useLocation();
  const season = new Date().getFullYear();

  const [allData, setAllData] = useState<VeloContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('hi_velo_fb_whiff_pct');
  const [sortDesc, setSortDesc] = useState(false);
  const [filterForeign, setFilterForeign] = useState<boolean | null>(null);
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [minPitches, setMinPitches] = useState(10);

  // Fetch raw data when filterTeam changes (team-specific JSON or all-batters JSON)
  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = filterTeam
      ? `/data/velocity-contact-${filterTeam}.json`
      : '/data/velocity-contact.json';
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => setAllData(json.batters ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [filterTeam]);

  useEffect(() => { document.title = '구속대별 컨택률 | BallTology'; }, []);

  // Client-side filtering and sorting
  const data = useMemo(() => {
    let filtered = [...allData];
    if (filterForeign !== null) {
      filtered = filtered.filter(d => d.is_foreign === filterForeign);
    }
    if (minPitches > 0) {
      filtered = filtered.filter(d => d.fb_swings >= minPitches);
    }
    filtered.sort((a, b) => {
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDesc ? bv - av : av - bv;
    });
    return filtered;
  }, [allData, sortKey, sortDesc, filterForeign, minPitches]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      const col = COLUMNS.find(c => c.key === key);
      setSortDesc(col?.defaultDesc ?? true);
    }
  };

  const whiffBg = (v: number | null | undefined): string => {
    if (v == null) return '';
    if (v >= 30) return 'bg-purple-200 font-semibold';
    if (v >= 20) return 'bg-purple-100';
    return '';
  };

  const contactBg = (v: number | null | undefined): string => {
    if (v == null) return '';
    if (v >= 70) return 'bg-green-200';
    if (v >= 60) return 'bg-green-100';
    return '';
  };

  const diffBg = (v: number | null | undefined): string => {
    if (v == null) return '';
    if (v >= 15) return 'bg-red-200 font-semibold';
    if (v >= 8) return 'bg-red-100';
    if (v <= -8) return 'bg-blue-100';
    return '';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">시범경기 구속대별 컨택률</h1>
          <p className="text-sm text-gray-500 mt-1">{season} 시범경기 타자 직구 구속대별 분석</p>
        </div>

        {/* Navigation */}
        <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
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
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <select
            value={filterForeign === null ? '' : String(filterForeign)}
            onChange={e => setFilterForeign(e.target.value === '' ? null : e.target.value === 'true')}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
          >
            <option value="">전체</option>
            <option value="false">국내</option>
            <option value="true">외국인</option>
          </select>
          <select
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
          >
            <option value="">전체 구단</option>
            {Object.entries(TEAM_NAME).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            최소 스윙
            <input
              type="number"
              value={minPitches}
              onChange={e => setMinPitches(Number(e.target.value) || 1)}
              min={1}
              className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-center"
            />
          </label>
        </div>

        {/* Content */}
        {loading ? <Spinner /> : error ? (
          <p className="text-red-500 text-center py-8">{error}</p>
        ) : data.length === 0 ? (
          <p className="text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-center text-gray-400 font-medium text-xs w-10">#</th>
                  <th className="px-4 py-2.5 text-left text-gray-500 font-medium text-xs">선수</th>
                  <th className="px-3 py-2.5 text-center text-gray-500 font-medium text-xs">팀</th>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-3 py-2.5 text-right text-gray-500 font-medium text-xs cursor-pointer hover:text-gray-900 select-none"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="ml-0.5 text-blue-500">{sortDesc ? '▼' : '▲'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr
                    key={row.pcode}
                    onClick={() => navigate(`/exhibition/${row.pcode}?season=${season}`)}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-blue-50/40 cursor-pointer"
                  >
                    <td className="px-3 py-2.5 text-center text-gray-300 text-xs">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {row.name}
                      {row.is_foreign && <span className="ml-1 text-[10px] text-orange-500 font-normal">외</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs font-semibold" style={{ color: teamColor(row.team) }}>
                      {teamName(row.team)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{row.total_pitches}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-mono ${contactBg(row.fb_contact_pct)}`}>
                      {fmtPct(row.fb_contact_pct)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-mono ${whiffBg(row.fb_whiff_pct)}`}>
                      {fmtPct(row.fb_whiff_pct)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-mono ${whiffBg(row.hi_velo_fb_whiff_pct)}`}>
                      {fmtPct(row.hi_velo_fb_whiff_pct)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-mono ${whiffBg(row.lo_velo_fb_whiff_pct)}`}>
                      {fmtPct(row.lo_velo_fb_whiff_pct)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-mono ${diffBg(row.velo_whiff_diff)}`}>
                      {fmtDiff(row.velo_whiff_diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 text-center">
          직구 계열 = 직구/투심/싱커 · 고속 = 147km/h 이상 · 차이 = 고속 Whiff% − 저속 Whiff% (양수 = 고속구에 약함)
        </p>
      </div>
    </div>
  );
}
