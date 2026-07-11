import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, RotateCcw, Undo2, Redo2, Info, TrendingUp, Award, Clock, BookOpen, Target, Sparkles, FileDown, Link, Calendar, Play, Pause, SkipBack, SkipForward, ExternalLink, GripVertical, List, Network, Search } from 'lucide-react';

// Configuration des couleurs par domaine
const domainColors = {
  "Cognitif et Métacognitif": "#2563eb",
  "Socio-Émotionnel": "#10b981", 
  "Technique et Numérique": "#06b6d4",
  "Éthique et Philosophie": "#8b5cf6",
  "Existentiel et Adaptatif": "#f59e0b",
  "Créativité et Design": "#ec4899"
};

// Niveaux de maîtrise
const niveaux = {
  1: { nom: "Émergent", color: "#10b981", icon: "🌱", radiusFactor: 0.4 },
  2: { nom: "Praticien", color: "#3b82f6", icon: "🌿", radiusFactor: 0.6 },
  3: { nom: "Maître", color: "#8b5cf6", icon: "🌳", radiusFactor: 0.8 },
  4: { nom: "Sage", color: "#ec4899", icon: "🏔️", radiusFactor: 1.0 }
};

// Fonction de correction d'encodage UTF-8 (inchangée)
const fixUTF8Encoding = (text) => {
  if (!text) return text;
  const corrections = {
    'Ã©': 'é', 'Ã¨': 'è', 'Ã ': 'à', 'Ã´': 'ô', 'Ã¢': 'â', 'Ãª': 'ê', 'Ã®': 'î',
    'Ã§': 'ç', 'Ã¹': 'ù', 'Ã»': 'û', 'Ã¯': 'ï', 'Ã«': 'ë', 'Ã€': 'À', 'Ã‰': 'É',
    'Ãˆ': 'È', 'Ã"': 'Ô', 'Ã‚': 'Â', 'ÃŠ': 'Ê', 'ÃŽ': 'Î', 'Ã‡': 'Ç', 'Ã™': 'Ù',
    'Ã›': 'Û', 'Ã': 'Ï', 'Ã‹': 'Ë'
  };
  let correctedText = text;
  for (const [bad, good] of Object.entries(corrections)) {
    correctedText = correctedText.replace(new RegExp(bad, 'g'), good);
  }
  return correctedText;
};

// Parser XML modifié pour enrichir les traces
const parseXMLData = (xmlString) => {
  const correctedXML = fixUTF8Encoding(xmlString);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(correctedXML, "text/xml");
  
  const parseGroup = (groupElement, parent, depth = 0) => {
    const id = fixUTF8Encoding(groupElement.getAttribute('ID'));
    const color = groupElement.getAttribute('COLOR');
    const node = { id, parent, depth, color: color || parent?.color, children: [], isLeaf: false, niveau: 0, competenceCount: 0, traces: [] };

    const competenceElements = Array.from(groupElement.children).filter(child => child.tagName === 'COMPETENCE');
    competenceElements.forEach(compEl => {
      const competenceId = fixUTF8Encoding(compEl.getAttribute('ID'));
      const traceElements = Array.from(compEl.children).filter(child => child.tagName === 'TRACE');
      const traces = traceElements.map(traceEl => ({
        id: fixUTF8Encoding(traceEl.getAttribute('ID')),
        url: fixUTF8Encoding(traceEl.getAttribute('URL')),
        date: traceEl.getAttribute('DATE'),
        points: parseFloat(traceEl.getAttribute('POINTS') || '0'),
        description: fixUTF8Encoding(traceEl.getAttribute('DESCRIPTION')),
        type: fixUTF8Encoding(traceEl.getAttribute('TYPE')),
        competenceId: competenceId,
        domainColor: node.color 
      }));
      const competenceNode = { id: competenceId, parent: node, depth: depth + 1, niveau: parseInt(compEl.getAttribute('NIVEAU') || '1'), description: fixUTF8Encoding(compEl.getAttribute('DESCRIPTION')), color: node.color, children: [], isLeaf: true, traces: traces };
      node.children.push(competenceNode);
      node.niveau = Math.max(node.niveau, competenceNode.niveau);
      node.competenceCount++;
      node.traces.push(...traces);
    });

    const groupElements = Array.from(groupElement.children).filter(child => child.tagName === 'GROUP');
    groupElements.forEach(groupEl => {
      const childNode = parseGroup(groupEl, node, depth + 1);
      node.children.push(childNode);
      node.competenceCount += childNode.competenceCount;
      if (childNode.niveau > node.niveau) node.niveau = childNode.niveau;
      node.traces.push(...childNode.traces);
    });
    return node;
  };

  const cartoElement = xmlDoc.querySelector('CARTO');
  const learner = fixUTF8Encoding(cartoElement?.getAttribute('LEARNER') || '');
  const rootNode = { id: learner, parent: null, depth: 0, children: [], isLeaf: false, niveau: 0, competenceCount: 0, traces: [] };

  const topGroups = xmlDoc.querySelectorAll('CARTO > GROUP');
  topGroups.forEach(groupEl => {
    const childNode = parseGroup(groupEl, rootNode, 1);
    rootNode.children.push(childNode);
    rootNode.competenceCount += childNode.competenceCount;
    rootNode.traces.push(...childNode.traces);
  });
  
  rootNode.traces.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { root: rootNode, learner };
};

// Helper function to calculate visible points for a node
const calculateVisiblePoints = (node, currentDate) => {
  if (!node) return 0;
  
  let totalPoints = 0;
  
  // Sum points from node's own traces
  const tracesPoints = (node.traces || [])
    .filter(trace => new Date(trace.date) <= currentDate)
    .reduce((sum, trace) => sum + trace.points, 0);
  
  totalPoints += tracesPoints;
  
  // Recursively sum points from children
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      totalPoints += calculateVisiblePoints(child, currentDate);
    });
  }
  
  return totalPoints;
};

// Helper function to get all visible traces recursively
const getAllVisibleTraces = (node, currentDate) => {
  if (!node) return [];
  
  let allTraces = [];
  
  // Add node's own traces
  const nodeTraces = (node.traces || [])
    .filter(trace => new Date(trace.date) <= currentDate);
  allTraces = [...allTraces, ...nodeTraces];
  
  // Recursively add children's traces
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      allTraces = [...allTraces, ...getAllVisibleTraces(child, currentDate)];
    });
  }
  
  return allTraces;
};

// MODIFIÉ : GitHub-style calendar pour l'année scolaire
const SchoolYearCalendar = ({ traces, currentDate, onDateClick, selectedSchoolYear, onSchoolYearChange }) => {
  const schoolYear = useMemo(() => {
    const [startYear] = selectedSchoolYear.split('-').map(Number);
    return {
      label: selectedSchoolYear,
      start: new Date(startYear, 7, 1), // 1er Août
      end: new Date(startYear + 1, 6, 31) // 31 Juillet
    };
  }, [selectedSchoolYear]);

  const months = ['Aoû', 'Sep', 'Oct', 'Nov', 'Déc', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jul'];

  const activityMap = useMemo(() => {
    const map = {};
    traces.forEach(trace => {
      const date = trace.date;
      if (!map[date]) map[date] = { count: 0, points: 0 };
      map[date].count++;
      map[date].points += trace.points;
    });
    return map;
  }, [traces]);

  const weeks = useMemo(() => {
    const weekList = [];
    const startDay = schoolYear.start.getDay();
    const adjustedStart = new Date(schoolYear.start);
    adjustedStart.setDate(schoolYear.start.getDate() - (startDay === 0 ? 6 : startDay - 1));

    let currentDateIter = new Date(adjustedStart);
    while (currentDateIter < schoolYear.end) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const dateStr = currentDateIter.toISOString().split('T')[0];
        const isInYear = currentDateIter >= schoolYear.start && currentDateIter < schoolYear.end;
        week.push({
          date: new Date(currentDateIter),
          dateStr,
          activity: activityMap[dateStr] || { count: 0, points: 0 },
          isInYear,
        });
        currentDateIter.setDate(currentDateIter.getDate() + 1);
      }
      weekList.push(week);
    }
    return weekList;
  }, [schoolYear, activityMap]);

  const getIntensityColor = (activity) => {
    if (activity.count === 0) return '#ebedf0';
    if (activity.count === 1) return '#9be9a8';
    if (activity.count === 2) return '#40c463';
    return '#30a14e';
  };

  const currentDateStr = currentDate?.toISOString().split('T')[0];

  const changeYear = (direction) => {
      const [start] = schoolYear.label.split('-').map(Number);
      const newStart = start + direction;
      onSchoolYearChange(`${newStart}-${(newStart + 1).toString().slice(-2)}`);
  };

  return (
    <div className="bg-white/80 p-2 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => changeYear(-1)} className="p-1 hover:bg-gray-100 rounded">‹</button>
        <h3 className="text-xs font-semibold text-gray-700">Année Scolaire {schoolYear.label}</h3>
        <button onClick={() => changeYear(1)} className="p-1 hover:bg-gray-100 rounded">›</button>
      </div>
      <div className="relative overflow-x-auto pb-2">
        <div className="flex text-xs text-gray-500 mb-1 pl-4">
          {months.map((month) => <div key={month} className="text-center" style={{minWidth: '35px'}}>{month}</div>)}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((day, dayIndex) => (
                <div
                  key={day.dateStr}
                  className={`w-2.5 h-2.5 rounded-sm cursor-pointer ${day.dateStr === currentDateStr ? 'ring-1 ring-blue-500' : ''}`}
                  style={{ backgroundColor: day.isInYear ? getIntensityColor(day.activity) : 'transparent' }}
                  title={`${day.date.toLocaleDateString('fr-FR')}: ${day.activity.count} activité(s)`}
                  onClick={() => day.isInYear && onDateClick(day.date)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Timeline component (inchangé)
const Timeline = ({ startDate, endDate, currentDate, onDateChange, isPlaying, onPlayPause }) => {
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const currentDay = Math.ceil((currentDate - startDate) / (1000 * 60 * 60 * 24));
    const percentage = totalDays > 0 ? Math.max(0, Math.min(100, (currentDay / totalDays) * 100)) : 0;

    const handleSliderChange = (e) => {
        const newPercentage = parseFloat(e.target.value);
        const newDay = Math.floor((newPercentage / 100) * totalDays);
        const newDate = new Date(startDate);
        newDate.setDate(startDate.getDate() + newDay);
        onDateChange(newDate);
    };

    return (
        <div className="flex items-center gap-2">
            <button onClick={onPlayPause} className="p-1 hover:bg-gray-100 rounded" title={isPlaying ? "Pause" : "Lecture"}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input type="range" min="0" max="100" step="0.1" value={percentage} onChange={handleSliderChange} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer flex-1" style={{ background: `linear-gradient(to right, #3b82f6 ${percentage}%, #e5e7eb ${percentage}%)` }} />
            <div className="text-xs font-medium text-gray-700 min-w-[70px] text-right">
                {currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </div>
        </div>
    );
};

// Circular Sector Component (inchangé)
const CircularSector = ({ sector, centerX, centerY, innerRadius, outerRadius, startAngle, endAngle, color, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }) => {
    const effectiveOuterRadius = useMemo(() => {
        if (sector.isLeaf && sector.niveau) {
            const radiusDiff = outerRadius - innerRadius;
            const factor = niveaux[sector.niveau].radiusFactor;
            return innerRadius + (radiusDiff * factor);
        }
        return outerRadius;
    }, [sector, innerRadius, outerRadius]);

    const pathData = useMemo(() => {
        const startAngleRad = (startAngle * Math.PI) / 180, endAngleRad = (endAngle * Math.PI) / 180;
        const x1 = centerX + innerRadius * Math.cos(startAngleRad), y1 = centerY + innerRadius * Math.sin(startAngleRad);
        const x2 = centerX + effectiveOuterRadius * Math.cos(startAngleRad), y2 = centerY + effectiveOuterRadius * Math.sin(startAngleRad);
        const x3 = centerX + effectiveOuterRadius * Math.cos(endAngleRad), y3 = centerY + effectiveOuterRadius * Math.sin(endAngleRad);
        const x4 = centerX + innerRadius * Math.cos(endAngleRad), y4 = centerY + innerRadius * Math.sin(endAngleRad);
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;
        return `M ${x1} ${y1} L ${x2} ${y2} A ${effectiveOuterRadius} ${effectiveOuterRadius} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1} Z`;
    }, [centerX, centerY, innerRadius, effectiveOuterRadius, startAngle, endAngle]);

    return (
        <path d={pathData} fill={color} fillOpacity={sector.isLeaf && sector.niveau ? 0.5 + (sector.niveau * 0.125) : 0.85} stroke={isSelected || isHovered ? "white" : "#333"} strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 0.5} style={{ cursor: 'pointer', transition: 'all 0.2s ease' }} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    );
};

// Tree Node Component (inchangé)
const TreeNode = ({ node, level = 0, onSelect, selectedId, currentView, hoveredId, expandedNodes, onToggle, currentDate }) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedId === node.id;
    const isCurrentView = currentView?.id === node.id;
    const isHovered = hoveredId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const visiblePoints = useMemo(() => calculateVisiblePoints(node, currentDate), [node, currentDate]);
    const niveau = niveaux[node.niveau] || niveaux[1];
    
    let bgClass = '';
    if (isCurrentView) bgClass = 'bg-blue-100 font-semibold';
    else if (isSelected) bgClass = 'bg-blue-50';
    else if (isHovered) bgClass = 'bg-yellow-50';
    
    if (visiblePoints === 0) return null;
    
    return (
        <div>
            <div className={`flex items-center py-1 px-1 hover:bg-gray-100 cursor-pointer rounded-md transition-all text-xs ${bgClass}`} style={{ paddingLeft: `${level * 12 + 4}px` }} onClick={() => onSelect(node)}>
                {hasChildren && (<button onClick={(e) => { e.stopPropagation(); onToggle(node.id); }} className="mr-1 text-gray-500 hover:text-gray-700">{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>)}
                {!hasChildren && <span className="w-4" />}
                <span className="flex-1 font-medium truncate">{node.id}</span>
                {node.isLeaf && (<span className="text-xs mr-2" title={niveau.nom}>{niveau.icon}</span>)}
                <span className="text-xs px-1.5 py-0.5 bg-blue-500 text-white rounded-full ml-1">{Math.round(visiblePoints)}</span>
            </div>
            {hasChildren && isExpanded && (
                <div>{node.children.map((child, index) => <TreeNode key={`${child.id}-${index}`} node={child} level={level + 1} {...{onSelect, selectedId, currentView, hoveredId, expandedNodes, onToggle, currentDate}} />)}</div>
            )}
        </div>
    );
};


// Helper functions
const findNodeById = (root, nodeId) => {
  if (root.id === nodeId) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, nodeId);
      if (found) return found;
    }
  }
  return null;
};
const getParentIds = (node) => {
  const parents = [];
  let current = node.parent;
  while (current) { parents.push(current.id); current = current.parent; }
  return parents;
};
const getMaxDepth = (node, currentDepth = 0) => {
  if (!node.children || node.children.length === 0) return currentDepth;
  return Math.max(...node.children.map(child => getMaxDepth(child, currentDepth + 1)));
};

// ResizableHandle Component
const ResizableHandle = ({ onMouseDown }) => (
  <div onMouseDown={onMouseDown} className="w-1.5 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex items-center justify-center transition-colors relative group">
    <GripVertical size={12} className="text-gray-400 group-hover:text-white" />
  </div>
);

// Helper to get school year from date
const getSchoolYearForDate = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    // L'année scolaire commence en Août (mois 7)
    if (month >= 7) {
        return `${year}-${(year + 1).toString().slice(-2)}`;
    } else {
        return `${year - 1}-${year.toString().slice(-2)}`;
    }
};

// Main Component
const CartographyViewer = () => {
  const [data, setData] = useState(null);
  const [currentView, setCurrentView] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredSector, setHoveredSector] = useState(null);
  const [permanentExpandedNodes, setPermanentExpandedNodes] = useState(new Set());
  const [temporaryExpandedNodes, setTemporaryExpandedNodes] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [svgSize, setSvgSize] = useState({ width: 400, height: 400 });
  const svgContainerRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('tree');
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [searchTerm, setSearchTerm] = useState(''); // NOUVEAU: état pour la recherche
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playDirection, setPlayDirection] = useState(1);
  const animationRef = useRef(null);

  // NOUVEAU: Gérer l'année scolaire
  const [selectedSchoolYear, setSelectedSchoolYear] = useState(getSchoolYearForDate(new Date()));
  
  const dateRange = useMemo(() => {
    if (!data) return { start: new Date(), end: new Date() };
    const dates = data.root.traces.map(t => new Date(t.date));
    if (dates.length === 0) return { start: new Date(), end: new Date() };
    return { start: new Date(Math.min(...dates)), end: new Date(Math.max(...dates)) };
  }, [data]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX, startWidth = rightPanelWidth;
    const handleMouseMove = (e) => setRightPanelWidth(Math.max(280, Math.min(600, startWidth + (startX - e.clientX))));
    const handleMouseUp = () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = setInterval(() => {
        setCurrentDate(prev => {
          const newDate = new Date(prev);
          newDate.setDate(newDate.getDate() + playDirection);
          if ((playDirection > 0 && newDate > dateRange.end) || (playDirection < 0 && newDate < dateRange.start)) {
            setIsPlaying(false);
            return playDirection > 0 ? dateRange.end : dateRange.start;
          }
          return newDate;
        });
      }, 100);
      return () => clearInterval(animationRef.current);
    }
  }, [isPlaying, playDirection, dateRange]);

  useEffect(() => {
    const updateSize = () => {
      if (svgContainerRef.current) {
        const rect = svgContainerRef.current.getBoundingClientRect();
        const size = Math.min(rect.width - 20, rect.height - 20);
        setSvgSize({ width: size, height: size });
      }
    };
    updateSize(); window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [rightPanelWidth]);

  const centerX = svgSize.width / 2;
  const centerY = svgSize.height / 2;
  const maxRadius = Math.min(svgSize.width, svgSize.height) * 0.42;
  const innerRadius = Math.min(svgSize.width, svgSize.height) * 0.08;

  useEffect(() => {
    const loadSampleData = () => {
      const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<CARTO EXAMID="Portfolio-2024" DATE="27 Décembre 2024" TEACHER="Système Adaptatif" LEARNER="Marie Dubois" XML_LANG="FR">
    <GROUP ID="Cognitif et Métacognitif" COLOR="#2563eb">
        <GROUP ID="Pensée Critique">
            <COMPETENCE ID="Analyse critique" POINTS="45" NIVEAU="2" DESCRIPTION="Analyse de sources, évaluation d'arguments">
                <TRACE ID="T001" URL="/portfolio/analyse1" DATE="2024-01-15" POINTS="20" DESCRIPTION="Analyse critique article" TYPE="ANALYSE" />
                <TRACE ID="T002" URL="/portfolio/analyse2" DATE="2024-02-20" POINTS="25" DESCRIPTION="Évaluation sources multiples" TYPE="ANALYSE" />
            </COMPETENCE>
            <COMPETENCE ID="Détection de biais" POINTS="30" NIVEAU="2" DESCRIPTION="Identification des biais cognitifs et algorithmiques">
                <TRACE ID="T003" URL="/portfolio/biais1" DATE="2024-03-10" POINTS="15" DESCRIPTION="Identification biais cognitifs" TYPE="ANALYSE" />
                <TRACE ID="T004" URL="/portfolio/biais2" DATE="2024-04-15" POINTS="15" DESCRIPTION="Analyse biais algorithmiques" TYPE="ANALYSE" />
            </COMPETENCE>
        </GROUP>
    </GROUP>
    <GROUP ID="Socio-Émotionnel" COLOR="#10b981">
        <GROUP ID="Intelligence Émotionnelle">
            <COMPETENCE ID="Empathie" POINTS="30" NIVEAU="2" DESCRIPTION="Compréhension d'autrui">
                <TRACE ID="T005" URL="/portfolio/empathie1" DATE="2024-01-20" POINTS="15" DESCRIPTION="Exercice d'empathie" TYPE="PRATIQUE" />
                <TRACE ID="T006" URL="/portfolio/empathie2" DATE="2024-03-10" POINTS="15" DESCRIPTION="Médiation de conflit" TYPE="MEDIATION" />
            </COMPETENCE>
        </GROUP>
    </GROUP>
    <METADATA>
        <TOTAL_POINTS>105</TOTAL_POINTS>
        <HEURES_FORMATION>10.5</HEURES_FORMATION>
        <ACTIVITES_REALISEES>6</ACTIVITES_REALISEES>
        <NIVEAU_MOYEN>2.0</NIVEAU_MOYEN>
        <DOMAINE_FORT>Cognitif et Métacognitif</DOMAINE_FORT>
        <PROGRESSION_TRIMESTRE>+35%</PROGRESSION_TRIMESTRE>
    </METADATA>
</CARTO>`;
      const parsedData = parseXMLData(sampleXML);
      setData(parsedData);
      setCurrentView(parsedData.root);
      addToHistory(parsedData.root);
      setPermanentExpandedNodes(new Set([parsedData.root.id]));
      const dates = parsedData.root.traces.map(t => new Date(t.date));
      if (dates.length > 0) {
          const lastDate = new Date(Math.max(...dates));
          setCurrentDate(lastDate);
          setSelectedSchoolYear(getSchoolYearForDate(lastDate));
      }
    };
    loadSampleData();
  }, []);
  
  const expandedNodes = useMemo(() => new Set([...permanentExpandedNodes, ...temporaryExpandedNodes]), [permanentExpandedNodes, temporaryExpandedNodes]);

  const addToHistory = (view) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(view); setHistory(newHistory); setHistoryIndex(newHistory.length - 1);
  };
  
  const handleSectorClick = (sector) => {
    setSelectedNode(sector);
    if (sector.children && sector.children.length > 0) {
      setCurrentView(sector); addToHistory(sector);
      setPermanentExpandedNodes(prev => new Set([...prev, sector.id]));
    }
  };

  const handleSectorHover = (sector) => {
    setHoveredSector(sector);
    if (sector) {
      const parents = getParentIds(sector);
      setTemporaryExpandedNodes(new Set(parents.filter(id => !permanentExpandedNodes.has(id))));
    } else setTemporaryExpandedNodes(new Set());
  };

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    if (node.children && node.children.length > 0) { setCurrentView(node); addToHistory(node); }
  };
  
  const handleToggleNode = (nodeId) => {
    setPermanentExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) newSet.delete(nodeId);
      else newSet.add(nodeId);
      return newSet;
    });
  };

  const handleDateChange = (newDate) => {
    setCurrentDate(newDate);
    setIsPlaying(false);
    // Met à jour l'année scolaire si la date change
    setSelectedSchoolYear(getSchoolYearForDate(newDate));
  };

  const handleActivityClick = (trace) => {
    const traceDate = new Date(trace.date);
    handleDateChange(traceDate);
    const competenceNode = findNodeById(data.root, trace.competenceId);
    if(competenceNode) {
      setSelectedNode(competenceNode);
      const parents = getParentIds(competenceNode);
      setPermanentExpandedNodes(new Set([...permanentExpandedNodes, ...parents, competenceNode.parent.id]));
    }
  };
  
  const handleReset = () => { if (data) { setCurrentView(data.root); addToHistory(data.root); setSelectedNode(null); } };

  const renderSectorsRecursive = (nodes, parentAngleStart, parentAngleEnd, depth, maxDepth, parentColor) => {
    const sectors = [];
    const totalValue = nodes.reduce((sum, node) => sum + calculateVisiblePoints(node, currentDate), 0);
    if (totalValue === 0) return sectors;
    let currentAngle = parentAngleStart;
    const ringWidth = (maxRadius - innerRadius) / Math.max(maxDepth, 1);
    nodes.forEach((node) => {
      const visiblePoints = calculateVisiblePoints(node, currentDate);
      if (visiblePoints === 0) return;
      const angleSize = (visiblePoints / totalValue) * (parentAngleEnd - parentAngleStart);
      const endAngle = currentAngle + angleSize;
      const nodeColor = node.color || parentColor;
      sectors.push(<CircularSector key={node.id} sector={node} centerX={svgSize.width/2} centerY={svgSize.height/2} innerRadius={innerRadius+(depth*ringWidth)} outerRadius={innerRadius+((depth+1)*ringWidth)} startAngle={currentAngle} endAngle={endAngle} color={nodeColor} isSelected={selectedNode?.id === node.id} isHovered={hoveredSector?.id === node.id} onClick={()=>handleSectorClick(node)} onMouseEnter={()=>handleSectorHover(node)} onMouseLeave={()=>handleSectorHover(null)}/>);
      if (node.children?.length > 0) sectors.push(...renderSectorsRecursive(node.children, currentAngle, endAngle, depth + 1, maxDepth, nodeColor));
      currentAngle = endAngle;
    });
    return sectors;
  };

  if (!data) return <div className="flex items-center justify-center h-screen">Chargement...</div>;

  const displayNode = selectedNode || hoveredSector;
  const displayNodePoints = displayNode ? calculateVisiblePoints(displayNode, currentDate) : calculateVisiblePoints(data.root, currentDate);
  const displayNodeTraces = displayNode 
    ? (displayNode.traces?.filter(t => new Date(t.date) <= currentDate) || [])
    : getAllVisibleTraces(data.root, currentDate);

  const filteredTraces = useMemo(() => {
    return data.root.traces
        .filter(trace => new Date(trace.date) <= currentDate)
        .filter(trace => searchTerm === '' || trace.description.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data.root.traces, currentDate, searchTerm]);

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 bg-white/80 backdrop-blur border-b">
           <div className="flex items-center justify-between mb-2">
             <div className="flex-1 min-w-0"><h1 className="text-lg font-bold truncate">{data.learner}</h1><div className="flex items-center gap-3 mt-1 text-xs text-gray-600 truncate"><span>{displayNode ? <>{displayNode.niveau > 0 && niveaux[displayNode.niveau]?.icon} {displayNode.id}</> : 'Vue complète'}</span><span className="px-2 py-0.5 bg-blue-500 text-white rounded-full">{Math.round(displayNodePoints)} pts</span><span>{displayNodeTraces.length} trace{displayNodeTraces.length !== 1 ? 's' : ''}</span></div></div>
             <div className="flex gap-1"><button onClick={handleReset} className="p-1.5 hover:bg-gray-100 rounded-lg"><RotateCcw size={16} /></button></div>
           </div>
           <Timeline startDate={dateRange.start} endDate={dateRange.end} currentDate={currentDate} onDateChange={handleDateChange} isPlaying={isPlaying} onPlayPause={() => setIsPlaying(!isPlaying)} />
        </div>
        
        <div className="flex-1 flex items-center justify-center p-2 min-h-0" ref={svgContainerRef}>
          <svg width={svgSize.width} height={svgSize.height}>
            <g>{currentView && renderSectorsRecursive(currentView.children, -90, 270, 0, getMaxDepth(currentView), null)}</g>
            <circle cx={svgSize.width/2} cy={svgSize.height/2} r={innerRadius} fill="#4c1d95" stroke="white" strokeWidth="2" cursor="pointer" onClick={handleReset}/>
          </svg>
        </div>
        
        {/* MODIFIÉ: Affichage conditionnel du calendrier */}
        <div className={`p-2 border-t bg-white/80 backdrop-blur transition-all duration-300 ${activeTab === 'history' ? 'opacity-100' : 'opacity-0 h-0 p-0 border-0 overflow-hidden'}`}>
             {activeTab === 'history' && <SchoolYearCalendar traces={data?.root?.traces || []} currentDate={currentDate} onDateClick={handleDateChange} selectedSchoolYear={selectedSchoolYear} onSchoolYearChange={setSelectedSchoolYear} />}
        </div>
      </div>

      <ResizableHandle onMouseDown={handleMouseDown} />

      <div style={{ width: `${rightPanelWidth}px` }} className="flex flex-col bg-white/95 backdrop-blur border-l">
        <div className="flex border-b">
            <button onClick={() => setActiveTab('tree')} className={`flex-1 p-2 text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === 'tree' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}><Network size={14} /> Arborescence</button>
            <button onClick={() => setActiveTab('history')} className={`flex-1 p-2 text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === 'history' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}><List size={14} /> Historique</button>
        </div>
        
        {activeTab === 'tree' && (<div className="flex-1 overflow-auto p-2"><TreeNode node={data.root} onSelect={handleNodeSelect} selectedId={selectedNode?.id} currentView={currentView} hoveredId={hoveredSector?.id} expandedNodes={expandedNodes} onToggle={handleToggleNode} currentDate={currentDate} /></div>)}
        
        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col overflow-y-hidden">
            {/* NOUVEAU: Barre de recherche */}
            <div className="p-2 border-b">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="Rechercher une activité..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-2 py-1 text-sm border rounded-md focus:ring-blue-500 focus:border-blue-500" />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredTraces.map(trace => (
                <div key={trace.id} onClick={() => handleActivityClick(trace)} className="flex items-start gap-3 p-2 bg-white rounded-md hover:bg-blue-50 transition-all cursor-pointer border">
                  <div className="w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: trace.domainColor }}/>
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium text-gray-800 truncate">{trace.description}</p><div className="text-xs text-gray-500 flex items-center justify-between"><span>{new Date(trace.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span><span className="font-semibold">{trace.points} pts</span></div></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartographyViewer;