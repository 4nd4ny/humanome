
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { 
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, 
  ExternalLink, ChevronDown, ChevronRight as Cr, Link as LinkIcon, 
  RotateCcw
} from "lucide-react";

/**
 * Unified Cartography + Temporal Progression Viewer
 * Single-file React component.
 * 
 * How to use:
 * - Place this file in your React app and import the default export.
 * - (Optional) Place an XML file at "/carto-new-xml.txt" (or pass `xmlText` prop).
 * - Uses Tailwind CSS classes for styling (you can replace with your CSS if needed).
 */

// -------------------- Config --------------------

const domainColors: Record<string, string> = {
  "Cognitif et Métacognitif": "#2563eb",
  "Socio-Émotionnel": "#10b981", 
  "Technique et Numérique": "#06b6d4",
  "Éthique et Philosophie": "#8b5cf6",
  "Existentiel et Adaptatif": "#f59e0b",
  "Créativité et Design": "#ec4899"
};

const niveaux: Record<number, { nom: string; color: string; icon: string; radiusFactor: number }> = {
  1: { nom: "Émergent",  color: "#10b981", icon: "🌱", radiusFactor: 0.4 },
  2: { nom: "Praticien", color: "#3b82f6", icon: "🌿", radiusFactor: 0.6 },
  3: { nom: "Maître",    color: "#8b5cf6", icon: "🌳", radiusFactor: 0.8 },
  4: { nom: "Sage",      color: "#ec4899", icon: "🏔️", radiusFactor: 1.0 }
};

// -------------------- Utils --------------------

const fixUTF8Encoding = (text: string) => {
  if (!text) return text;
  const corrections: Record<string, string> = {
    'ÃƒÂ©': 'é', 'Ã©': 'é', 'ÃƒÂ¨': 'è', 'Ã¨': 'è', 'Ãƒ ': 'à', 'Ã ': 'à',
    'ÃƒÂ´': 'ô', 'Ã´': 'ô', 'ÃƒÂ¢': 'â', 'Ã¢': 'â', 'ÃƒÂª': 'ê', 'Ãª': 'ê',
    'ÃƒÂ®': 'î', 'Ã®': 'î', 'ÃƒÂ§': 'ç', 'Ã§': 'ç', 'ÃƒÂ¹': 'ù', 'Ã¹': 'ù',
    'ÃƒÂ»': 'û', 'Ã»': 'û', 'ÃƒÂ¯': 'ï', 'Ã¯': 'ï', 'ÃƒÂ«': 'ë', 'Ã«': 'ë',
    'Ãƒ€': 'À', 'Ãƒ‰': 'É', 'ÃƒË†': 'È', 'Ãƒ"': 'Ô', 'Ãƒ‚': 'Â', 'ÃƒÅ ': 'Ê',
    'ÃƒÅ½': 'Î', 'Ãƒ‡': 'Ç', 'Ãƒ™': 'Ù', 'Ãƒ›': 'Û', 'Ãƒ': 'Ï', 'Ãƒ‹': 'Ë',
  };
  let corrected = text;
  for (const [bad, good] of Object.entries(corrections)) {
    corrected = corrected.replace(new RegExp(bad, "g"), good);
  }
  return corrected;
};

// -------------------- Types --------------------

type Trace = {
  id: string;
  url: string;
  date: string;  // YYYY-MM-DD
  points: number;
  description: string;
  type: string;
  competence?: string;
  domain?: string;
  domainColor?: string;
};

type NodeT = {
  id: string;
  parent: NodeT | null;
  depth: number;
  points: number;
  color?: string;
  children: NodeT[];
  isLeaf: boolean;
  niveau: number;
  competenceCount: number;
  description?: string;
  traces: Trace[];
};

type ParsedData = {
  root: NodeT;
  learner: string;
  examId: string;
  date: string;
  teacher: string;
  metadata: Record<string, any>;
};

// -------------------- XML Parser --------------------

const parseXMLData = (xmlString: string): ParsedData => {
  const correctedXML = fixUTF8Encoding(xmlString);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(correctedXML, "text/xml");

  const parseGroup = (groupEl: Element, parent: NodeT | null, depth: number): NodeT => {
    const id = fixUTF8Encoding(groupEl.getAttribute("ID") || "");
    const color = groupEl.getAttribute("COLOR") || (parent?.color ?? undefined);
    const node: NodeT = {
      id, parent, depth,
      points: 0,
      color,
      children: [],
      isLeaf: false,
      niveau: 0,
      competenceCount: 0,
      traces: []
    };

    // COMPETENCE
    const compEls = Array.from(groupEl.children).filter(c => c.tagName === "COMPETENCE");
    compEls.forEach(compEl => {
      const traceEls = Array.from(compEl.children).filter(c => c.tagName === "TRACE");
      const traces: Trace[] = traceEls.map(tr => ({
        id: fixUTF8Encoding(tr.getAttribute("ID") || ""),
        url: fixUTF8Encoding(tr.getAttribute("URL") || "#"),
        date: (tr.getAttribute("DATE") || "").slice(0, 10),
        points: parseFloat(tr.getAttribute("POINTS") || "0"),
        description: fixUTF8Encoding(tr.getAttribute("DESCRIPTION") || ""),
        type: fixUTF8Encoding(tr.getAttribute("TYPE") || ""),
        competence: fixUTF8Encoding(compEl.getAttribute("ID") || ""),
        domain: parent?.id || "",
        domainColor: color
      }));

      const compNode: NodeT = {
        id: fixUTF8Encoding(compEl.getAttribute("ID") || ""),
        parent: node, depth: depth + 1,
        points: parseFloat(compEl.getAttribute("POINTS") || "0"),
        niveau: parseInt(compEl.getAttribute("NIVEAU") || "1"),
        description: fixUTF8Encoding(compEl.getAttribute("DESCRIPTION") || ""),
        color,
        children: [], isLeaf: true,
        competenceCount: 1,
        traces
      };

      node.children.push(compNode);
      node.points += compNode.points;
      node.niveau = Math.max(node.niveau, compNode.niveau);
      node.competenceCount += 1;
      node.traces.push(...traces);
    });

    // GROUP children
    const grpEls = Array.from(groupEl.children).filter(c => c.tagName === "GROUP");
    grpEls.forEach(g => {
      const child = parseGroup(g, node, depth + 1);
      node.children.push(child);
      node.points += child.points;
      node.niveau = Math.max(node.niveau, child.niveau);
      node.competenceCount += child.competenceCount;
      node.traces.push(...child.traces);
    });

    return node;
  };

  const carto = xmlDoc.querySelector("CARTO");
  const learner = fixUTF8Encoding(carto?.getAttribute("LEARNER") || "");
  const examId  = fixUTF8Encoding(carto?.getAttribute("EXAMID") || "");
  const date    = fixUTF8Encoding(carto?.getAttribute("DATE") || "");
  const teacher = fixUTF8Encoding(carto?.getAttribute("TEACHER") || "");

  const metadataEl = xmlDoc.querySelector("METADATA");
  const metadata: Record<string, any> = {
    totalPoints: parseFloat(metadataEl?.querySelector("TOTAL_POINTS")?.textContent || "0"),
    heuresFormation: parseFloat(metadataEl?.querySelector("HEURES_FORMATION")?.textContent || "0"),
    activitesRealisees: parseInt(metadataEl?.querySelector("ACTIVITES_REALISEES")?.textContent || "0"),
    niveauMoyen: parseFloat(metadataEl?.querySelector("NIVEAU_MOYEN")?.textContent || "0"),
    domaineFort: fixUTF8Encoding(metadataEl?.querySelector("DOMAINE_FORT")?.textContent || ""),
    progressionTrimestre: metadataEl?.querySelector("PROGRESSION_TRIMESTRE")?.textContent || "",
    premiereTrace: metadataEl?.querySelector("PREMIERE_TRACE")?.textContent || "",
    derniereTrace: metadataEl?.querySelector("DERNIERE_TRACE")?.textContent || ""
  };

  const root: NodeT = {
    id: learner || "Élève",
    parent: null, depth: 0,
    points: 0,
    children: [],
    isLeaf: false,
    niveau: 0,
    competenceCount: 0,
    traces: []
  };

  const topGroups = xmlDoc.querySelectorAll("CARTO > GROUP");
  topGroups.forEach(g => {
    const child = parseGroup(g, root, 1);
    root.children.push(child);
    root.points += child.points;
    root.niveau = Math.max(root.niveau, child.niveau);
    root.competenceCount += child.competenceCount;
    root.traces.push(...child.traces);
  });

  return { root, learner, examId, date, teacher, metadata };
};

// -------------------- Helpers --------------------

const collectNodeIds = (node: NodeT): Set<string> => {
  const ids = new Set<string>();
  const walk = (n: NodeT) => {
    ids.add(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return ids;
};

const findNodeById = (node: NodeT, id: string): NodeT | null => {
  if (node.id === id) return node;
  for (const c of node.children) {
    const found = findNodeById(c, id);
    if (found) return found;
  }
  return null;
};

// -------------------- UI Subcomponents --------------------

const MonthLabels: React.FC<{labels: {month: string; weekIndex: number}[], cellSize: number}> = ({labels, cellSize}) => (
  <div className="flex mb-2" style={{ paddingLeft: 30, position: 'relative', height: 20 }}>
    {labels.map((l, i) => (
      <div key={i} className="text-xs text-gray-700" style={{ position: 'absolute', left: `${30 + l.weekIndex * (cellSize + 3)}px` }}>
        {l.month}
      </div>
    ))}
  </div>
);

const DayLabels: React.FC<{cellSize: number}> = ({cellSize}) => {
  const labels = ['','Lun','','Mer','','Ven',''];
  return (
    <div className="flex flex-col gap-[3px]" style={{ width: 30, marginTop: 20 }}>
      {labels.map((lab,i)=>(
        <div key={i} className="text-xs text-gray-500" style={{ height: cellSize }}>
          {lab}
        </div>
      ))}
    </div>
  );
};

// -------------------- Main Component --------------------

type Props = { xmlText?: string };

const UnifiedCartography: React.FC<Props> = ({ xmlText }) => {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(new Date("2024-12-31"));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playDirection, setPlayDirection] = useState<number>(1);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTraces, setShowTraces] = useState<Set<string>>(new Set());
  const [maskListBefore, setMaskListBefore] = useState<boolean>(true); // requirement 1
  const animationRef = useRef<number | null>(null);

  // Heatmap sizing
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState<number>(11);

  // Load XML (from prop or fetch)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const txt = xmlText ?? await (await fetch("/carto-new-xml.txt")).text();
        if (cancelled) return;
        const p = parseXMLData(txt);
        setParsed(p);
        // Find year range
        const allDates = p.root.traces.map(t => new Date(t.date));
        allDates.sort((a,b)=>+a-+b);
        const years = [...new Set(allDates.map(d => d.getFullYear()))];
        setAvailableYears(years);
        const end = allDates[allDates.length-1] || new Date("2024-12-31");
        setCurrentDate(end);
        setSelectedYear(end.getFullYear());
      } catch (e) {
        console.warn("XML load failed; using fallback sample.", e);
        // Fallback sample (minimal)
        const sample = `<?xml version="1.0"?><CARTO EXAMID="Demo" DATE="2024-12-31" TEACHER="Système" LEARNER="Marie Dubois" XML_LANG="FR">
          <GROUP ID="Technique et Numérique" COLOR="#06b6d4">
            <GROUP ID="Littératie IA">
              <COMPETENCE ID="Utilisation d'IA" POINTS="10" NIVEAU="2" DESCRIPTION="">
                <TRACE ID="T1" URL="/a" DATE="2024-01-10" POINTS="5" DESCRIPTION="ChatGPT avancé" TYPE="COMPETENCE_TECHNIQUE" />
                <TRACE ID="T2" URL="/b" DATE="2024-04-20" POINTS="5" DESCRIPTION="Création d'images" TYPE="CRÉATION_ARTISTIQUE" />
              </COMPETENCE>
            </GROUP>
          </GROUP>
        </CARTO>`;
        const p = parseXMLData(sample);
        setParsed(p);
        setAvailableYears([2024]);
        setCurrentDate(new Date("2024-12-31"));
        setSelectedYear(2024);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [xmlText]);

  // Derived: focus node (tree selection)
  const focusNode = useMemo(() => {
    if (!parsed) return null;
    if (!focusNodeId) return parsed.root;
    return findNodeById(parsed.root, focusNodeId) ?? parsed.root;
  }, [parsed, focusNodeId]);

  // Timeline bounds from all traces
  const dateRange = useMemo(() => {
    if (!parsed || parsed.root.traces.length === 0) {
      return { start: new Date("2024-01-01"), end: new Date("2024-12-31") };
    }
    const ds = parsed.root.traces.map(t => new Date(t.date));
    ds.sort((a,b)=>+a-+b);
    const start = new Date(ds[0].getFullYear(), ds[0].getMonth(), 1);
    const end   = new Date(ds[ds.length-1].getFullYear(), ds[ds.length-1].getMonth()+1, 0);
    return { start, end };
  }, [parsed]);

  // Focused traces (filter by focus node)
  const focusedTraces: Trace[] = useMemo(() => {
    if (!parsed || !focusNode) return [];
    const ids = collectNodeIds(focusNode);
    // A trace belongs to a competence node (leaf id) or to domain id via "domain" field
    return parsed.root.traces.filter(tr => {
      // include if its competence OR its domain is within the focus subtree
      const compOk = tr.competence && ids.has(tr.competence);
      const domOk  = tr.domain && ids.has(tr.domain);
      return compOk || domOk;
    }).sort((a,b)=> a.date.localeCompare(b.date));
  }, [parsed, focusNode]);

  // Activity map up to pivot date (mask squares AFTER the selected date)
  const pivotDate = selectedDate ?? currentDate;
  const activityMap = useMemo(() => {
    const map: Record<string, {count: number; points: number; traces: Trace[]; color: string; isMulti: boolean}> = {};
    focusedTraces.forEach(t => {
      const tDate = new Date(t.date);
      if (tDate <= pivotDate) {
        const key = t.date;
        if (!map[key]) map[key] = { count: 0, points: 0, traces: [], color: "#ebedf0", isMulti: false };
        map[key].count += 1;
        map[key].points += t.points;
        map[key].traces.push(t);
      }
    });
    // Color rule: one domain -> domainColor; many -> gray by intensity
    Object.keys(map).forEach(k => {
      const colors = [...new Set(map[k].traces.map(tr => tr.domainColor || "#bbb"))];
      if (colors.length === 1) {
        map[k].color = colors[0];
      } else {
        const intensity = Math.min(map[k].count/5, 1);
        const g = Math.round(220 - intensity*70);
        map[k].color = `rgb(${g},${g},${g})`;
        map[k].isMulti = true;
      }
    });
    return map;
  }, [focusedTraces, pivotDate]);

  // Calendar grid (GitHub-like heatmap)
  const calendarGrid = useMemo(() => {
    const year = selectedYear;
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() - jan1.getDay());
    const lastSunday = new Date(dec31);
    lastSunday.setDate(dec31.getDate() + (6 - dec31.getDay()));
    const weeks = Math.ceil((+lastSunday - +firstSunday) / (7*24*60*60*1000)) + 1;

    const grid: {date: Date; dateStr: string; isInYear: boolean; isFuture: boolean; activity: typeof activityMap[string] | null; month: number; day: number}[][] = [];
    let iter = new Date(firstSunday);
    for (let w=0; w<weeks; w++) {
      const days: any[] = [];
      for (let d=0; d<7; d++) {
        const dateStr = iter.toISOString().split("T")[0];
        days.push({
          date: new Date(iter),
          dateStr,
          isInYear: iter.getFullYear() === year,
          isFuture: iter > pivotDate, // mask following days (requirement 3)
          activity: activityMap[dateStr] || null,
          month: iter.getMonth(),
          day: iter.getDate()
        });
        iter.setDate(iter.getDate()+1);
      }
      grid.push(days);
    }
    return grid;
  }, [selectedYear, activityMap, pivotDate]);

  // Month labels positions
  const monthLabels = useMemo(() => {
    const labels: {month: string; weekIndex: number}[] = [];
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    if (calendarGrid.length === 0) return labels;
    let current = -1;
    calendarGrid.forEach((week, wi) => {
      week.forEach(day => {
        if (day.isInYear && day.day === 1 && day.month !== current) {
          current = day.month;
          labels.push({ month: months[day.month], weekIndex: wi });
        }
      });
    });
    return labels;
  }, [calendarGrid]);

  // Responsive cell size: fill available width (requirement 4)
  useEffect(() => {
    const computeSize = () => {
      if (!calendarRef.current || calendarGrid.length === 0) return;
      const containerWidth = calendarRef.current.clientWidth;
      const left = 38; // labels
      const weeks = calendarGrid.length;
      const gaps = weeks > 0 ? (weeks - 1) * 3 : 0;
      const usable = Math.max(0, containerWidth - left - gaps - 20);
      const sz = Math.floor(usable / Math.max(1, weeks));
      setCellSize(Math.max(10, Math.min(sz, 14)));
    };
    computeSize();
    window.addEventListener("resize", computeSize);
    return () => window.removeEventListener("resize", computeSize);
  }, [calendarGrid]);

  // Playback
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() + playDirection * 2);
        if ((playDirection > 0 && next > dateRange.end) || (playDirection < 0 && next < dateRange.start)) {
          setIsPlaying(false);
          return playDirection > 0 ? dateRange.end : dateRange.start;
        }
        return next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [isPlaying, playDirection, dateRange]);

  const sliderPercentage = useMemo(() => {
    const total = +dateRange.end - +dateRange.start;
    const cur = +currentDate - +dateRange.start;
    return total ? Math.max(0, Math.min(100, (cur / total) * 100)) : 0;
  }, [currentDate, dateRange]);

  const stats = useMemo(() => {
    const pivot = pivotDate;
    const visible = focusedTraces.filter(t => new Date(t.date) <= pivot);
    return {
      total: focusedTraces.length,
      visible: visible.length,
      points: visible.reduce((s,t)=>s+t.points, 0)
    };
  }, [focusedTraces, pivotDate]);

  const onPlayPause = () => setIsPlaying(p => !p);
  const onReverse   = () => { setPlayDirection(-1); setIsPlaying(true); };
  const onToEnd     = () => { setIsPlaying(false); setCurrentDate(dateRange.end); setSelectedDate(null); };

  const onSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = parseFloat(e.target.value);
    const total = +dateRange.end - +dateRange.start;
    const t = +dateRange.start + (total * p / 100);
    const nd = new Date(t);
    setCurrentDate(nd);
    setSelectedDate(null);
    setSelectedYear(nd.getFullYear());
    setIsPlaying(false);
  };

  const onHeatmapClick = (d: Date) => {
    if (d <= dateRange.end) {
      setSelectedDate(d);
      setCurrentDate(d);          // requirement 2: slider moves to date
      setSelectedYear(d.getFullYear());
      setIsPlaying(false);
    }
  };

  // Tree rendering
  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };
  const toggleTraces = (id: string) => {
    const next = new Set(showTraces);
    next.has(id) ? next.delete(id) : next.add(id);
    setShowTraces(next);
  };

  const TreeNode: React.FC<{node: NodeT; level?: number}> = ({node, level=0}) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const visibleTraces = node.traces.filter(t => new Date(t.date) <= pivotDate);
    const isLeafVisible = node.isLeaf ? visibleTraces.length > 0 : true;
    if (node.isLeaf && !isLeafVisible) return null;

    const niv = niveaux[node.niveau] || niveaux[1];
    const isFocused = focusNodeId === node.id || (!focusNodeId && node === parsed?.root);

    return (
      <div>
        <div 
          className={`flex items-center py-1.5 px-2 hover:bg-gray-100 cursor-pointer rounded-md transition-all ${isFocused?'bg-blue-100':''}`}
          style={{ paddingLeft: level*18 + 8 }}
          onClick={() => setFocusNodeId(node.id)}
        >
          {hasChildren ? (
            <button onClick={(e)=>{e.stopPropagation(); toggleExpand(node.id);}} className="mr-1 text-gray-500 hover:text-gray-700">
              {isExpanded ? <ChevronDown size={16}/> : <Cr size={16}/>}
            </button>
          ) : <span className="w-4" />}
          <span className="flex-1 text-sm font-medium">{node.id}</span>
          {!node.isLeaf && node.niveau>0 && <span className="text-xs ml-2" title={niv.nom}>{niv.icon}</span>}
          {visibleTraces.length>0 && (
            <span className="text-xs px-2 py-0.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full ml-2">
              {Math.round(visibleTraces.reduce((s,t)=>s+t.points,0))}pts
            </span>
          )}
          {node.isLeaf && visibleTraces.length>0 && (
            <button 
              onClick={(e)=>{e.stopPropagation(); toggleTraces(node.id);}}
              className="ml-2 text-blue-600 hover:text-blue-800"
              title={`${visibleTraces.length} trace(s)`}
            >
              <LinkIcon size={14}/>
              <span className="text-xs ml-1">{visibleTraces.length}</span>
            </button>
          )}
        </div>
        {showTraces.has(node.id) && visibleTraces.length>0 && (
          <div className="ml-8 mt-1 mb-2 p-2 bg-gray-50 rounded-md text-xs">
            {visibleTraces.map(tr => (
              <div key={tr.id} className="flex items-start gap-2 py-1 hover:bg-gray-100 rounded px-1">
                <span className="text-gray-500 mt-0.5">•</span>
                <div className="flex-1">
                  <a href={tr.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1" onClick={(e)=>e.stopPropagation()}>
                    {tr.description} <ExternalLink size={10}/>
                  </a>
                  <div className="text-gray-500 mt-0.5">
                    {new Date(tr.date).toLocaleDateString('fr-FR')} • {tr.points}pts • {tr.type}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {hasChildren && isExpanded && node.children.map((c,i)=>(
          <TreeNode key={node.id+"-"+i} node={c} level={level+1}/>
        ))}
      </div>
    );
  };

  // Radial sectors (simple bands per top group -> subgroups -> competences)
  const Radial: React.FC = () => {
    if (!parsed || !focusNode) return null;

    const centerX = 220, centerY = 220;
    const baseInner = 50;
    const ringWidth = 50;
    const maxDepth = 1 + Math.max(0, getDepth(focusNode));

    function getDepth(n: NodeT): number {
      if (n.children.length===0) return 0;
      return 1 + Math.max(...n.children.map(getDepth));
    }

    // Build sectors only for children of focusNode to keep it readable
    const sectors: {node: NodeT; inner: number; outer: number; start: number; end: number; color: string}[] = [];
    const total = focusNode.children.reduce((s,c)=> s + (c.points||1), 0) || 1;
    let angle = -90; // start at top
    focusNode.children.forEach(child => {
      const share = (child.points||1)/total;
      const span = 360*share;
      const inner = baseInner;
      const outer = baseInner + ringWidth * (1 + (child.isLeaf ? 0 : Math.min(2, getDepth(child))));
      sectors.push({ node: child, inner, outer, start: angle, end: angle+span, color: child.color || "#999" });
      angle += span;
    });

    const onSectorClick = (n: NodeT) => {
      setFocusNodeId(n.id);
    };

    const pathFor = (inner:number, outer:number, start:number, end:number) => {
      const sr = (start*Math.PI)/180, er = (end*Math.PI)/180;
      const x1 = centerX + inner*Math.cos(sr),  y1 = centerY + inner*Math.sin(sr);
      const x2 = centerX + outer*Math.cos(sr),  y2 = centerY + outer*Math.sin(sr);
      const x3 = centerX + outer*Math.cos(er),  y3 = centerY + outer*Math.sin(er);
      const x4 = centerX + inner*Math.cos(er),  y4 = centerY + inner*Math.sin(er);
      const large = end-start>180 ? 1 : 0;
      return `M ${x1} ${y1} L ${x2} ${y2} A ${outer} ${outer} 0 ${large} 1 ${x3} ${y3} L ${x4} ${y4} A ${inner} ${inner} 0 ${large} 0 ${x1} ${y1} Z`;
    };

    return (
      <svg width={440} height={440} className="bg-white rounded-xl shadow-sm">
        <defs>
          <radialGradient id="hl" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.0"/>
            <stop offset="100%" stopColor="#fff" stopOpacity="0.25"/>
          </radialGradient>
        </defs>
        <g>
          {sectors.map((s,i)=>(
            <g key={i} onClick={()=>onSectorClick(s.node)} style={{cursor:"pointer"}}>
              <path d={pathFor(s.inner, s.outer, s.start, s.end)} fill={s.color} fillOpacity={0.75} stroke="#111" strokeWidth={0.5}/>
              <path d={pathFor(s.inner, s.outer, s.start, s.end)} fill="url(#hl)" pointerEvents="none"/>
            </g>
          ))}
          <circle cx={centerX} cy={centerY} r={baseInner-1} fill="#fff" stroke="#e5e7eb"/>
          <text x={centerX} y={centerY-6} textAnchor="middle" fontSize="14" fontWeight={700}>{parsed.learner || "Élève"}</text>
          <text x={centerX} y={centerY+12} textAnchor="middle" fontSize="11" fill="#6b7280">{focusNode.id}</text>
        </g>
      </svg>
    );
  };

  // Bottom list of traces (sorted) with masking behavior
  const bottomTraces = useMemo(() => {
    const list = focusedTraces.slice().sort((a,b)=> a.date.localeCompare(b.date));
    if (!selectedDate) return list;
    if (maskListBefore) {
      // hide previous events (show selected and after)
      return list.filter(t => new Date(t.date) >= selectedDate);
    } else {
      // show previous only
      return list.filter(t => new Date(t.date) <= selectedDate);
    }
  }, [focusedTraces, selectedDate, maskListBefore]);

  const handleTraceClick = (tr: Trace) => {
    const d = new Date(tr.date);
    setSelectedDate(d);
    setCurrentDate(d);      // sync slider
    setSelectedYear(d.getFullYear());
  };

  if (!parsed) {
    return <div className="p-6 text-gray-600">Chargement…</div>;
  }

  return (
    <div className="p-6 bg-white font-sans max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Vue unifiée — Cartographie & Progression temporelle
          </h2>
          <div className="text-gray-600 text-sm mt-1">
            {parsed.learner} • {parsed.examId} • {parsed.date}
          </div>
        </div>
        <button
          onClick={()=>{ setFocusNodeId(null); setSelectedDate(null); setCurrentDate(dateRange.end); setSelectedYear(dateRange.end.getFullYear()); setIsPlaying(false); }}
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200"
          title="Réinitialiser la vue"
        >
          <RotateCcw size={16}/> Réinitialiser
        </button>
      </div>

      {/* Controls bar (timeline + stats) */}
      <div className="mb-5 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onReverse} className="p-2 hover:bg-white rounded-full transition-all shadow-sm hover:shadow-md" title="Rembobiner">
            <SkipBack size={20}/>
          </button>
          <button onClick={onPlayPause} className="p-3 bg-white hover:bg-gray-50 rounded-full transition-all shadow-md hover:shadow-lg" title={isPlaying ? "Pause" : "Lecture"}>
            {isPlaying ? <Pause size={24}/> : <Play size={24}/>}
          </button>
          <button onClick={onToEnd} className="p-2 hover:bg-white rounded-full transition-all shadow-sm hover:shadow-md" title="Aller à la fin">
            <SkipForward size={20}/>
          </button>

          <div className="flex-1 px-4">
            <input type="range" min={0} max={100} step={0.1} value={sliderPercentage} onChange={onSlider}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{background: `linear-gradient(to right, #3b82f6 ${sliderPercentage}%, #e5e7eb ${sliderPercentage}%)`}}
            />
          </div>

          <div className="text-sm font-medium text-gray-700 w-40 text-right bg-white px-3 py-1 rounded-lg shadow-sm">
            {currentDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-700">
          <div>
            <span className="font-semibold">{stats.visible}</span> / {stats.total} activités visibles • 
            <span className="font-semibold ml-2">{Math.round(stats.points)}</span> pts
          </div>
          {availableYears.length>1 && (
            <div className="flex items-center gap-2">
              <button onClick={()=>setSelectedYear(y => Math.max(availableYears[0], y-1))} disabled={selectedYear===availableYears[0]} className="p-1 disabled:opacity-30">
                <ChevronLeft size={18}/>
              </button>
              <span className="font-semibold">{selectedYear}</span>
              <button onClick={()=>setSelectedYear(y => Math.min(availableYears[availableYears.length-1], y+1))} disabled={selectedYear===availableYears[availableYears.length-1]} className="p-1 disabled:opacity-30">
                <ChevronRight size={18}/>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main grid: Tree + Radial + Heatmap */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 bg-white rounded-xl border border-gray-200 p-3 overflow-auto max-h-[520px]">
          <div className="text-sm font-semibold text-gray-700 mb-2">Structure</div>
          <div className="text-xs text-gray-500 mb-2">Cliquez pour focaliser la vue • Cliquez sur le compteur pour afficher les traces</div>
          <TreeNode node={parsed.root}/>
        </div>

        <div className="col-span-4 flex items-center justify-center">
          <Radial/>
        </div>

        <div className="col-span-4 bg-white rounded-xl border border-gray-200 p-3">
          <div ref={calendarRef} className="w-full">
            <MonthLabels labels={monthLabels} cellSize={cellSize}/>
            <div className="flex gap-[3px]" style={{marginTop: 20}}>
              <DayLabels cellSize={cellSize}/>
              {calendarGrid.map((week, wi)=>(
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di)=>{
                    const isSelected = selectedDate && day.date.toISOString().slice(0,10) === selectedDate.toISOString().slice(0,10);
                    return (
                      <div
                        key={di}
                        onClick={()=> day.isInYear && onHeatmapClick(day.date)}
                        title={`${day.date.toLocaleDateString('fr-FR')} • ${(day.activity?.count||0)} activité(s) • ${(day.activity?.points||0)} pts`}
                        className={`rounded-sm cursor-pointer hover:ring-1 hover:ring-gray-400 ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                        style={{
                          width: cellSize, height: cellSize,
                          background: day.isInYear ? (day.activity ? day.activity.color : '#ebedf0') : '#f0f0f0',
                          opacity: day.isFuture ? 0.1 : (day.isInYear ? 1 : 0.3)
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom list with masking rules */}
      <div className="mt-5 bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-3">
          <div className="text-sm font-semibold text-gray-700">Activités (liste synchronisée)</div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={maskListBefore} onChange={e=>setMaskListBefore(e.target.checked)}/>
              <span>Masquer les évènements <b>précédents</b> au clic (liste)</span>
            </label>
          </div>
        </div>
        <div className="max-h-64 overflow-auto divide-y divide-gray-100">
          {bottomTraces.map(tr => {
            const isSel = selectedDate && tr.date === selectedDate.toISOString().slice(0,10);
            return (
              <div key={tr.id} className={`flex items-center gap-3 p-2 ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <button className="text-xs px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200" onClick={()=>handleTraceClick(tr)} title="Synchroniser la vue sur cette date">
                  Aller
                </button>
                <div className="w-28 text-xs text-gray-600">{new Date(tr.date).toLocaleDateString('fr-FR')}</div>
                <div className="flex-1 text-sm">
                  <div className="font-medium">{tr.description}</div>
                  <div className="text-xs text-gray-500">{tr.type} • {tr.points}pts</div>
                </div>
                <div className="w-3 h-3 rounded-sm" style={{background: tr.domainColor || '#bbb'}} title={tr.domain || ''} />
                <a href={tr.url} className="text-blue-600 text-xs hover:underline" target="_blank" rel="noreferrer">ouvrir</a>
              </div>
            );
          })}
          {bottomTraces.length===0 && (
            <div className="p-4 text-sm text-gray-500">Aucune activité à afficher.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnifiedCartography;
