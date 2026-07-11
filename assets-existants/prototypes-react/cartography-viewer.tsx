import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, RotateCcw, Undo2, Redo2, Info, TrendingUp, Award, Clock, BookOpen, Target, Sparkles, FileDown, Link, Calendar, Play, Pause, SkipBack, SkipForward, ExternalLink } from 'lucide-react';

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

// Fonction de correction d'encodage UTF-8
const fixUTF8Encoding = (text) => {
  if (!text) return text;
  const corrections = {
    'Ã©': 'é',
    'Ã¨': 'è',
    'Ã ': 'à',
    'Ã´': 'ô',
    'Ã¢': 'â',
    'Ãª': 'ê',
    'Ã®': 'î',
    'Ã§': 'ç',
    'Ã¹': 'ù',
    'Ã»': 'û',
    'Ã¯': 'ï',
    'Ã«': 'ë',
    'Ã€': 'À',
    'Ã‰': 'É',
    'Ãˆ': 'È',
    'Ã"': 'Ô',
    'Ã‚': 'Â',
    'ÃŠ': 'Ê',
    'ÃŽ': 'Î',
    'Ã‡': 'Ç',
    'Ã™': 'Ù',
    'Ã›': 'Û',
    'Ã': 'Ï',
    'Ã‹': 'Ë'
  };
  
  let correctedText = text;
  for (const [bad, good] of Object.entries(corrections)) {
    correctedText = correctedText.replace(new RegExp(bad, 'g'), good);
  }
  
  return correctedText;
};

// Parser XML avec correction d'encodage et extraction des traces
const parseXMLData = (xmlString) => {
  const correctedXML = fixUTF8Encoding(xmlString);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(correctedXML, "text/xml");
  
  const parseGroup = (groupElement, parent = null, depth = 0) => {
    const id = fixUTF8Encoding(groupElement.getAttribute('ID'));
    const color = groupElement.getAttribute('COLOR');
    
    const node = {
      id,
      parent,
      depth,
      points: 0,
      color: color || (parent?.color),
      children: [],
      isLeaf: false,
      niveau: 0,
      competenceCount: 0,
      traces: [] // Pour stocker toutes les traces du groupe
    };

    // Parse COMPETENCE elements
    const competenceElements = Array.from(groupElement.children).filter(child => child.tagName === 'COMPETENCE');
    competenceElements.forEach(compEl => {
      // Parse traces for this competence
      const traceElements = Array.from(compEl.children).filter(child => child.tagName === 'TRACE');
      const traces = traceElements.map(traceEl => ({
        id: fixUTF8Encoding(traceEl.getAttribute('ID')),
        url: fixUTF8Encoding(traceEl.getAttribute('URL')),
        date: traceEl.getAttribute('DATE'),
        points: parseFloat(traceEl.getAttribute('POINTS') || 0),
        description: fixUTF8Encoding(traceEl.getAttribute('DESCRIPTION')),
        type: fixUTF8Encoding(traceEl.getAttribute('TYPE'))
      }));
      
      const competenceNode = {
        id: fixUTF8Encoding(compEl.getAttribute('ID')),
        parent: node,
        depth: depth + 1,
        points: parseFloat(compEl.getAttribute('POINTS') || 0),
        niveau: parseInt(compEl.getAttribute('NIVEAU') || 1),
        description: fixUTF8Encoding(compEl.getAttribute('DESCRIPTION')),
        color: node.color,
        children: [],
        isLeaf: true,
        traces: traces // Store traces for this competence
      };
      
      node.children.push(competenceNode);
      node.points += competenceNode.points;
      node.niveau = Math.max(node.niveau, competenceNode.niveau);
      node.competenceCount++;
      // Add traces to parent group as well
      node.traces.push(...traces);
    });

    // Parse nested GROUP elements
    const groupElements = Array.from(groupElement.children).filter(child => child.tagName === 'GROUP');
    groupElements.forEach(groupEl => {
      const childNode = parseGroup(groupEl, node, depth + 1);
      node.children.push(childNode);
      node.points += childNode.points;
      node.competenceCount += childNode.competenceCount;
      if (childNode.niveau > node.niveau) {
        node.niveau = childNode.niveau;
      }
      // Add child traces to parent
      node.traces.push(...childNode.traces);
    });

    return node;
  };

  const cartoElement = xmlDoc.querySelector('CARTO');
  const learner = fixUTF8Encoding(cartoElement?.getAttribute('LEARNER') || '');
  const examId = fixUTF8Encoding(cartoElement?.getAttribute('EXAMID') || '');
  const date = fixUTF8Encoding(cartoElement?.getAttribute('DATE') || '');
  const teacher = fixUTF8Encoding(cartoElement?.getAttribute('TEACHER') || '');

  // Parse metadata
  const metadataElement = xmlDoc.querySelector('METADATA');
  const metadata = {
    totalPoints: parseFloat(metadataElement?.querySelector('TOTAL_POINTS')?.textContent || 0),
    heuresFormation: parseFloat(metadataElement?.querySelector('HEURES_FORMATION')?.textContent || 0),
    activitesRealisees: parseInt(metadataElement?.querySelector('ACTIVITES_REALISEES')?.textContent || 0),
    niveauMoyen: parseFloat(metadataElement?.querySelector('NIVEAU_MOYEN')?.textContent || 0),
    domaineFort: fixUTF8Encoding(metadataElement?.querySelector('DOMAINE_FORT')?.textContent || ''),
    progressionTrimestre: metadataElement?.querySelector('PROGRESSION_TRIMESTRE')?.textContent || '',
    premiereTrace: metadataElement?.querySelector('PREMIERE_TRACE')?.textContent || '',
    derniereTrace: metadataElement?.querySelector('DERNIERE_TRACE')?.textContent || ''
  };

  const rootNode = {
    id: learner,
    parent: null,
    depth: 0,
    points: 0,
    children: [],
    isLeaf: false,
    niveau: 0,
    competenceCount: 0,
    traces: []
  };

  const topGroups = xmlDoc.querySelectorAll('CARTO > GROUP');
  topGroups.forEach(groupEl => {
    const childNode = parseGroup(groupEl, rootNode, 1);
    rootNode.children.push(childNode);
    rootNode.points += childNode.points;
    rootNode.competenceCount += childNode.competenceCount;
    rootNode.traces.push(...childNode.traces);
  });

  return { root: rootNode, learner, examId, date, teacher, metadata };
};

// GitHub-style calendar component
const GitHubCalendar = ({ data, currentDate, onDateClick, selectedYear }) => {
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const days = ['Lun', 'Mer', 'Ven'];
  
  // Create calendar for current year only
  const calendarData = useMemo(() => {
    if (!data) return { grid: [], activityMap: {} };
    
    // Helper to get domain color
    const getDomainColor = (node) => {
      let current = node;
      while (current && current.parent) {
        if (current.parent.parent === null) {
          return current.color;
        }
        current = current.parent;
      }
      return '#9ca3af';
    };
    
    // Collect all traces
    const collectTraces = (node) => {
      const traces = [];
      
      if (node.traces && node.traces.length > 0) {
        const domainColor = getDomainColor(node);
        node.traces.forEach(trace => {
          if (new Date(trace.date) <= currentDate) {
            traces.push({ ...trace, domainColor });
          }
        });
      }
      
      if (node.children) {
        node.children.forEach(child => {
          traces.push(...collectTraces(child));
        });
      }
      
      return traces;
    };
    
    const allTraces = collectTraces(data.root);
    
    // Create activity map
    const activityMap = {};
    allTraces.forEach(trace => {
      const date = trace.date;
      if (!activityMap[date]) {
        activityMap[date] = { 
          count: 0, 
          domains: new Set(),
          color: null 
        };
      }
      activityMap[date].count++;
      activityMap[date].domains.add(trace.domainColor);
      
      // Determine color
      if (activityMap[date].domains.size === 1) {
        // Single domain = use domain color
        activityMap[date].color = trace.domainColor;
      } else {
        // Multiple domains - darker gray based on count
        const intensity = Math.min(activityMap[date].count / 5, 1);
        const grayValue = Math.round(200 - (intensity * 150)); // From 200 to 50
        activityMap[date].color = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
      }
    });
    
    // Create grid for selected year only
    const grid = [];
    const year = selectedYear;
    
    // Find first Monday of the year
    const jan1 = new Date(year, 0, 1);
    const dayOfWeek = jan1.getDay() || 7;
    const firstMonday = new Date(jan1);
    firstMonday.setDate(jan1.getDate() - (dayOfWeek - 1));
    
    let currentDateIter = new Date(firstMonday);
    
    // Create exactly 52 weeks
    for (let week = 0; week < 52; week++) {
      const weekData = [];
      
      // Create 7 days (Monday to Sunday)
      for (let day = 0; day < 7; day++) {
        const dateStr = currentDateIter.toISOString().split('T')[0];
        const activity = activityMap[dateStr];
        
        weekData.push({
          date: new Date(currentDateIter),
          dateStr: dateStr,
          activity: activity || null,
          isInYear: currentDateIter.getFullYear() === year
        });
        
        currentDateIter.setDate(currentDateIter.getDate() + 1);
      }
      
      grid.push(weekData);
    }
    
    return { grid, activityMap };
  }, [data, currentDate, selectedYear]);
  
  const currentDateStr = currentDate?.toISOString().split('T')[0];
  
  return (
    <div className="bg-white rounded-lg p-4">
      <div className="text-sm font-medium text-gray-900 mb-4">
        Calendrier d'acquisition des compétences - {selectedYear}
      </div>
      
      <div className="bg-white">
        {/* Month labels */}
        <div className="flex mb-2" style={{ marginLeft: '40px' }}>
          {months.map((month, i) => (
            <div key={i} className="text-[10px] text-gray-600" style={{ width: `${100/12}%` }}>
              {month}
            </div>
          ))}
        </div>
        
        {/* Grid container */}
        <div className="flex">
          {/* Day labels (3 out of 7) */}
          <div className="flex flex-col justify-around mr-2" style={{ width: '30px' }}>
            <div className="text-[10px] text-gray-600 text-right h-[11px]" style={{ marginTop: '0px' }}>Lun</div>
            <div className="text-[10px] text-gray-600 text-right h-[11px]">Mer</div>
            <div className="text-[10px] text-gray-600 text-right h-[11px]" style={{ marginBottom: '0px' }}>Ven</div>
          </div>
          
          {/* Calendar grid - 52 columns × 7 rows */}
          <div className="flex gap-[2px]">
            {calendarData.grid.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[2px]">
                {week.map((day, dayIndex) => {
                  const isSelected = day.dateStr === currentDateStr;
                  
                  // Determine color
                  let bgColor = '#e5e7eb'; // Light gray by default
                  if (day.activity) {
                    bgColor = day.activity.color;
                  }
                  
                  return (
                    <div
                      key={dayIndex}
                      className={`w-[12px] h-[12px] rounded-[1px] cursor-pointer ${
                        isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                      } hover:ring-1 hover:ring-gray-400`}
                      style={{
                        backgroundColor: bgColor,
                        opacity: day.isInYear ? 1 : 0.3
                      }}
                      title={`${day.date.toLocaleDateString('fr-FR')}: ${day.activity ? day.activity.count + ' activité(s)' : 'Aucune activité'}`}
                      onClick={() => onDateClick(day.date)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          
          {/* Year label on the right */}
          <div className="ml-3 flex items-center">
            <div className="text-sm font-bold text-gray-700">{selectedYear}</div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Intensité:</span>
            <div className="flex gap-1">
              <div className="w-[10px] h-[10px] rounded-sm bg-gray-200" title="Aucune" />
              <div className="w-[10px] h-[10px] rounded-sm bg-gray-400" title="Faible" />
              <div className="w-[10px] h-[10px] rounded-sm bg-gray-600" title="Moyenne" />
              <div className="w-[10px] h-[10px] rounded-sm bg-gray-800" title="Forte" />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Domaines:</span>
            <div className="flex gap-1">
              <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: '#2563eb' }} title="Cognitif" />
              <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: '#10b981' }} title="Socio-Émotionnel" />
              <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: '#06b6d4' }} title="Technique" />
              <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: '#8b5cf6' }} title="Éthique" />
              <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: '#f59e0b' }} title="Existentiel" />
              <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: '#ec4899' }} title="Créativité" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Timeline component
const Timeline = ({ startDate, endDate, currentDate, onDateChange, isPlaying, onPlayPause, onReverse }) => {
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const currentDay = Math.ceil((currentDate - startDate) / (1000 * 60 * 60 * 24));
  const percentage = (currentDay / totalDays) * 100;
  
  const handleSliderChange = (e) => {
    const newPercentage = parseFloat(e.target.value);
    const newDay = Math.floor((newPercentage / 100) * totalDays);
    const newDate = new Date(startDate);
    newDate.setDate(startDate.getDate() + newDay);
    onDateChange(newDate);
  };
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={onReverse}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Rembobiner"
        >
          <SkipBack size={20} />
        </button>
        
        <button
          onClick={onPlayPause}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title={isPlaying ? "Pause" : "Lecture"}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        
        <button
          onClick={() => onDateChange(endDate)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Aller à la fin"
        >
          <SkipForward size={20} />
        </button>
        
        <div className="flex-1">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={percentage}
            onChange={handleSliderChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${percentage}%, #e5e7eb ${percentage}%)`
            }}
          />
        </div>
        
        <div className="text-sm font-medium text-gray-700 min-w-[100px] text-right">
          {currentDate.toLocaleDateString('fr-FR')}
        </div>
      </div>
    </div>
  );
};

// Circular Sector Component
const CircularSector = ({ 
  sector, 
  centerX, 
  centerY, 
  innerRadius, 
  outerRadius, 
  startAngle, 
  endAngle, 
  color,
  isSelected,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
  maxOuterRadius,
  isVisible
}) => {
  if (!isVisible) return null;
  
  const effectiveOuterRadius = useMemo(() => {
    if (sector.isLeaf && sector.niveau) {
      const radiusDiff = outerRadius - innerRadius;
      const factor = niveaux[sector.niveau].radiusFactor;
      return innerRadius + (radiusDiff * factor);
    }
    return outerRadius;
  }, [sector, innerRadius, outerRadius]);

  const pathData = useMemo(() => {
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;
    
    const x1 = centerX + innerRadius * Math.cos(startAngleRad);
    const y1 = centerY + innerRadius * Math.sin(startAngleRad);
    const x2 = centerX + effectiveOuterRadius * Math.cos(startAngleRad);
    const y2 = centerY + effectiveOuterRadius * Math.sin(startAngleRad);
    const x3 = centerX + effectiveOuterRadius * Math.cos(endAngleRad);
    const y3 = centerY + effectiveOuterRadius * Math.sin(endAngleRad);
    const x4 = centerX + innerRadius * Math.cos(endAngleRad);
    const y4 = centerY + innerRadius * Math.sin(endAngleRad);
    
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    return `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${effectiveOuterRadius} ${effectiveOuterRadius} 0 ${largeArc} 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1}
      Z
    `;
  }, [centerX, centerY, innerRadius, effectiveOuterRadius, startAngle, endAngle]);

  const fillOpacity = sector.isLeaf && sector.niveau 
    ? 0.5 + (sector.niveau * 0.125)
    : 0.85;

  const externalGraySectors = useMemo(() => {
    if (!sector.isLeaf || !maxOuterRadius) return null;
    
    const sectors = [];
    const radiusDiff = outerRadius - innerRadius;
    
    for (let level = 2; level <= 4; level++) {
      if (sector.niveau < level) {
        const levelInnerRadius = innerRadius + (radiusDiff * niveaux[level - 1]?.radiusFactor || 0.4);
        const levelOuterRadius = innerRadius + (radiusDiff * niveaux[level].radiusFactor);
        
        const startAngleRad = (startAngle * Math.PI) / 180;
        const endAngleRad = (endAngle * Math.PI) / 180;
        
        const x1 = centerX + levelInnerRadius * Math.cos(startAngleRad);
        const y1 = centerY + levelInnerRadius * Math.sin(startAngleRad);
        const x2 = centerX + levelOuterRadius * Math.cos(startAngleRad);
        const y2 = centerY + levelOuterRadius * Math.sin(startAngleRad);
        const x3 = centerX + levelOuterRadius * Math.cos(endAngleRad);
        const y3 = centerY + levelOuterRadius * Math.sin(endAngleRad);
        const x4 = centerX + levelInnerRadius * Math.cos(endAngleRad);
        const y4 = centerY + levelInnerRadius * Math.sin(endAngleRad);
        
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;
        
        const grayPath = `
          M ${x1} ${y1}
          L ${x2} ${y2}
          A ${levelOuterRadius} ${levelOuterRadius} 0 ${largeArc} 1 ${x3} ${y3}
          L ${x4} ${y4}
          A ${levelInnerRadius} ${levelInnerRadius} 0 ${largeArc} 0 ${x1} ${y1}
          Z
        `;
        
        const grayIntensity = level === 2 ? '#d1d5db' : level === 3 ? '#9ca3af' : '#6b7280';
        
        sectors.push(
          <path
            key={`gray-sector-${level}`}
            d={grayPath}
            fill={grayIntensity}
            fillOpacity={0.3}
            stroke="#e5e7eb"
            strokeWidth="0.5"
            pointerEvents="none"
          />
        );
      }
    }
    
    return sectors;
  }, [sector, centerX, centerY, innerRadius, outerRadius, startAngle, endAngle, maxOuterRadius]);

  return (
    <g>
      {externalGraySectors}
      <path 
        d={pathData} 
        fill={color}
        fillOpacity={fillOpacity}
        stroke={isSelected || isHovered ? "white" : "#333"}
        strokeWidth={isSelected ? 3 : isHovered ? 2 : 0.5}
        style={{ 
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
      {(isSelected || isHovered) && (
        <path 
          d={pathData} 
          fill="url(#highlightGradient)"
          fillOpacity={0.2}
          pointerEvents="none"
        />
      )}
    </g>
  );
};

// Tree Node Component with traces
const TreeNode = ({ node, level = 0, onSelect, selectedId, currentView, hoveredId, expandedNodes, onToggle, currentDate, showTraces, onToggleTraces }) => {
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedId === node.id;
  const isCurrentView = currentView?.id === node.id;
  const isHovered = hoveredId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const hasTraces = node.traces && node.traces.length > 0;
  const areTracesVisible = showTraces.has(node.id);
  
  // Filter traces based on current date
  const visibleTraces = useMemo(() => {
    if (!node.traces || !currentDate) return [];
    return node.traces.filter(trace => new Date(trace.date) <= currentDate);
  }, [node.traces, currentDate]);
  
  const niveau = niveaux[node.niveau] || niveaux[1];
  
  let bgClass = '';
  if (isCurrentView) {
    bgClass = 'bg-blue-200 font-semibold';
  } else if (isHovered) {
    bgClass = 'bg-yellow-100';
  } else if (isSelected) {
    bgClass = 'bg-blue-100';
  }
  
  // Don't show node if it has no visible traces and is a leaf
  if (node.isLeaf && visibleTraces.length === 0) {
    return null;
  }
  
  return (
    <div>
      <div 
        className={`flex items-center py-1.5 px-2 hover:bg-gray-100 cursor-pointer rounded-md transition-all ${bgClass}`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => onSelect(node)}
        title={isCurrentView ? 'Vue actuelle' : ''}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="mr-1 text-gray-500 hover:text-gray-700"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
        {!hasChildren && <span className="w-5" />}
        
        <span className="flex-1 text-sm font-medium">{node.id}</span>
        
        {isCurrentView && (
          <span className="text-xs bg-blue-500 text-white px-1 rounded mr-2">Vue</span>
        )}
        
        {node.isLeaf && hasTraces && visibleTraces.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleTraces(node.id);
            }}
            className="mr-2 text-blue-500 hover:text-blue-700"
            title={`${visibleTraces.length} trace(s)`}
          >
            <Link size={14} />
            <span className="text-xs ml-1">{visibleTraces.length}</span>
          </button>
        )}
        
        {node.isLeaf && node.niveau > 0 && visibleTraces.length > 0 && (
          <div className="flex items-center gap-1 mr-2">
            <span className="text-xs" title={niveau.nom}>
              {niveau.icon}
            </span>
            <div className="flex gap-0.5">
              {[2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`w-2 h-2 rounded-sm ${
                    node.niveau >= level ? 'bg-gradient-to-r from-blue-500 to-purple-500' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
        
        {!node.isLeaf && node.niveau > 0 && (
          <span className="text-xs ml-2" title={niveau.nom}>
            {niveau.icon}
          </span>
        )}
        
        {visibleTraces.length > 0 && (
          <span 
            className="text-xs px-2 py-0.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full ml-2"
            title={`${node.points} points d'expérience`}
          >
            {Math.round(visibleTraces.reduce((sum, t) => sum + t.points, 0))}pts
          </span>
        )}
      </div>
      
      {/* Show traces if expanded */}
      {areTracesVisible && visibleTraces.length > 0 && (
        <div className="ml-8 mt-1 mb-2 p-2 bg-gray-50 rounded-md text-xs">
          {visibleTraces.map((trace, idx) => (
            <div key={trace.id} className="flex items-start gap-2 py-1 hover:bg-gray-100 rounded px-1">
              <span className="text-gray-500 mt-0.5">•</span>
              <div className="flex-1">
                <a 
                  href={trace.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {trace.description}
                  <ExternalLink size={10} />
                </a>
                <div className="text-gray-500 mt-0.5">
                  {new Date(trace.date).toLocaleDateString('fr-FR')} • {trace.points}pts • {trace.type}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child, idx) => {
            // Check if child should be visible based on traces
            const childVisible = child.isLeaf 
              ? child.traces?.some(t => new Date(t.date) <= currentDate)
              : child.traces?.some(t => new Date(t.date) <= currentDate);
              
            if (!childVisible && child.isLeaf) return null;
            
            return (
              <TreeNode 
                key={`${child.id}-${idx}`}
                node={child} 
                level={level + 1}
                onSelect={onSelect}
                selectedId={selectedId}
                currentView={currentView}
                hoveredId={hoveredId}
                expandedNodes={expandedNodes}
                onToggle={onToggle}
                currentDate={currentDate}
                showTraces={showTraces}
                onToggleTraces={onToggleTraces}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// Helper functions
const findNodeById = (root, nodeId) => {
  if (root.id === nodeId) return root;
  if (root.children) {
    for (let child of root.children) {
      const found = findNodeById(child, nodeId);
      if (found) return found;
    }
  }
  return null;
};

const getParentIds = (node) => {
  const parents = [];
  let current = node.parent;
  while (current) {
    parents.push(current.id);
    current = current.parent;
  }
  return parents;
};

const getMaxDepth = (node, currentDepth = 0) => {
  if (!node.children || node.children.length === 0) return currentDepth;
  return Math.max(...node.children.map(child => getMaxDepth(child, currentDepth + 1)));
};

// Main Component
const CartographyViewer = () => {
  // Add custom CSS for slider
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  
  const [data, setData] = useState(null);
  const [currentView, setCurrentView] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredSector, setHoveredSector] = useState(null);
  const [permanentExpandedNodes, setPermanentExpandedNodes] = useState(new Set());
  const [temporaryExpandedNodes, setTemporaryExpandedNodes] = useState(new Set());
  const [showTraces, setShowTraces] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 800 });
  const svgContainerRef = useRef(null);
  const svgRef = useRef(null);
  
  // Timeline state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playDirection, setPlayDirection] = useState(1); // 1 for forward, -1 for backward
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const animationRef = useRef(null);
  
  // Calculate date range from traces
  const dateRange = useMemo(() => {
    if (!data) return { start: new Date(), end: new Date() };
    const dates = data.root.traces.map(t => new Date(t.date));
    if (dates.length === 0) return { start: new Date(), end: new Date() };
    return {
      start: new Date(Math.min(...dates)),
      end: new Date(Math.max(...dates))
    };
  }, [data]);

  // Animation logic
  useEffect(() => {
    if (isPlaying && data) {
      const animate = () => {
        setCurrentDate(prevDate => {
          const newDate = new Date(prevDate);
          newDate.setDate(newDate.getDate() + playDirection);
          
          // Check bounds
          if (playDirection > 0 && newDate > dateRange.end) {
            setIsPlaying(false);
            return dateRange.end;
          }
          if (playDirection < 0 && newDate < dateRange.start) {
            setIsPlaying(false);
            return dateRange.start;
          }
          
          return newDate;
        });
      };
      
      animationRef.current = setInterval(animate, 200); // Update every 200ms for smoother animation
      
      return () => {
        if (animationRef.current) {
          clearInterval(animationRef.current);
        }
      };
    }
  }, [isPlaying, playDirection, dateRange, data]);

  // Calculate SVG dimensions
  useEffect(() => {
    const updateSize = () => {
      if (svgContainerRef.current) {
        const rect = svgContainerRef.current.getBoundingClientRect();
        const size = Math.min(rect.width - 40, rect.height - 40);
        setSvgSize({ width: size, height: size });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const centerX = svgSize.width / 2;
  const centerY = svgSize.height / 2;
  const maxRadius = Math.min(svgSize.width, svgSize.height) * 0.42;
  const innerRadius = Math.min(svgSize.width, svgSize.height) * 0.08;

  const expandedNodes = useMemo(() => {
    return new Set([...permanentExpandedNodes, ...temporaryExpandedNodes]);
  }, [permanentExpandedNodes, temporaryExpandedNodes]);

  // Load XML data
  useEffect(() => {
    const loadFromFile = async () => {
      try {
        const response = await window.fs.readFile('carto-new-xml.txt', { encoding: 'utf8' });
        const parsedData = parseXMLData(response);
        setData(parsedData);
        setCurrentView(parsedData.root);
        addToHistory(parsedData.root);
        setPermanentExpandedNodes(new Set([parsedData.root.id]));
        
        // Set initial date to the end date
        const dates = parsedData.root.traces.map(t => new Date(t.date));
        if (dates.length > 0) {
          setCurrentDate(new Date(Math.max(...dates)));
        }
      } catch (error) {
        console.error('Error loading file:', error);
        loadSampleData();
      }
    };

    const loadSampleData = () => {
      const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<CARTO EXAMID="Portfolio-2024" DATE="27 Décembre 2024" TEACHER="Système Adaptatif" LEARNER="Marie Dubois" XML_LANG="FR">
    <GROUP ID="Cognitif et Métacognitif" COLOR="#2563eb">
        <GROUP ID="Pensée Critique">
            <COMPETENCE ID="Analyse critique" POINTS="45" NIVEAU="2" DESCRIPTION="Analyse de sources, évaluation d'arguments">
                <TRACE ID="T001" URL="/portfolio/analyse1" DATE="2024-01-15" POINTS="20" DESCRIPTION="Analyse critique article" TYPE="ANALYSE" />
                <TRACE ID="T002" URL="/portfolio/analyse2" DATE="2024-01-15" POINTS="25" DESCRIPTION="Évaluation sources multiples" TYPE="ANALYSE" />
                <TRACE ID="T003" URL="/portfolio/analyse3" DATE="2024-02-20" POINTS="15" DESCRIPTION="Synthèse critique" TYPE="SYNTHESE" />
            </COMPETENCE>
        </GROUP>
    </GROUP>
    <GROUP ID="Socio-Émotionnel" COLOR="#10b981">
        <GROUP ID="Intelligence Émotionnelle">
            <COMPETENCE ID="Empathie" POINTS="30" NIVEAU="2" DESCRIPTION="Compréhension d'autrui">
                <TRACE ID="T004" URL="/portfolio/empathie1" DATE="2024-01-20" POINTS="15" DESCRIPTION="Exercice d'empathie" TYPE="PRATIQUE" />
                <TRACE ID="T005" URL="/portfolio/empathie2" DATE="2024-03-10" POINTS="15" DESCRIPTION="Médiation de conflit" TYPE="MEDIATION" />
            </COMPETENCE>
        </GROUP>
    </GROUP>
    <GROUP ID="Technique et Numérique" COLOR="#06b6d4">
        <GROUP ID="Programmation">
            <COMPETENCE ID="Python" POINTS="40" NIVEAU="2" DESCRIPTION="Programmation Python">
                <TRACE ID="T006" URL="/portfolio/python1" DATE="2024-01-20" POINTS="20" DESCRIPTION="Premier programme" TYPE="CODE" />
                <TRACE ID="T007" URL="/portfolio/python2" DATE="2024-04-15" POINTS="20" DESCRIPTION="Projet complexe" TYPE="PROJET" />
            </COMPETENCE>
        </GROUP>
    </GROUP>
    <METADATA>
        <TOTAL_POINTS>115</TOTAL_POINTS>
        <HEURES_FORMATION>11.5</HEURES_FORMATION>
        <ACTIVITES_REALISEES>7</ACTIVITES_REALISEES>
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
      setCurrentDate(new Date());
    };

    loadFromFile();
  }, []);

  const addToHistory = (view) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(view);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleSectorClick = (sector) => {
    setSelectedNode(sector);
    const allExpanded = new Set([...permanentExpandedNodes, ...temporaryExpandedNodes]);
    setPermanentExpandedNodes(allExpanded);
    setTemporaryExpandedNodes(new Set());
    
    if (sector.children && sector.children.length > 0) {
      setCurrentView(sector);
      addToHistory(sector);
      setPermanentExpandedNodes(prev => new Set([...prev, sector.id]));
    }
  };

  const handleSectorHover = (sector) => {
    if (sector) {
      setHoveredSector(sector);
      const parents = getParentIds(sector);
      const toExpand = parents.filter(parentId => !permanentExpandedNodes.has(parentId));
      setTemporaryExpandedNodes(new Set(toExpand));
    } else {
      setHoveredSector(null);
      setTemporaryExpandedNodes(new Set());
    }
  };

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    
    if (node.children && node.children.length > 0) {
      setPermanentExpandedNodes(prev => {
        const newSet = new Set(prev);
        const wasExpanded = newSet.has(node.id);
        
        if (wasExpanded) {
          newSet.delete(node.id);
          if (currentView.id === node.id && currentView.parent) {
            setCurrentView(currentView.parent);
            addToHistory(currentView.parent);
          }
        } else {
          newSet.add(node.id);
          const parents = getParentIds(node);
          parents.forEach(parentId => newSet.add(parentId));
          setCurrentView(node);
          addToHistory(node);
        }
        return newSet;
      });
    }
  };

  const handleToggleNode = (nodeId) => {
    const node = findNodeById(data.root, nodeId);
    if (!node) return;
    
    setPermanentExpandedNodes(prev => {
      const newSet = new Set(prev);
      const wasExpanded = newSet.has(nodeId);
      
      if (wasExpanded) {
        newSet.delete(nodeId);
        if (currentView.id === nodeId && currentView.parent) {
          setCurrentView(currentView.parent);
          addToHistory(currentView.parent);
        }
      } else {
        newSet.add(nodeId);
        if (node.children && node.children.length > 0) {
          setCurrentView(node);
          addToHistory(node);
          const parents = getParentIds(node);
          parents.forEach(parentId => newSet.add(parentId));
        }
      }
      return newSet;
    });
  };

  const handleToggleTraces = (nodeId) => {
    setShowTraces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handlePlayPause = () => {
    setPlayDirection(1);
    setIsPlaying(!isPlaying);
  };

  const handleReverse = () => {
    setPlayDirection(-1);
    setIsPlaying(true);
  };

  const handleDateChange = (newDate) => {
    setCurrentDate(newDate);
    setSelectedYear(newDate.getFullYear());
    setIsPlaying(false);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const newView = history[newIndex];
      setHistoryIndex(newIndex);
      setCurrentView(newView);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const newView = history[newIndex];
      setHistoryIndex(newIndex);
      setCurrentView(newView);
    }
  };

  const handleReset = () => {
    if (data) {
      setCurrentView(data.root);
      addToHistory(data.root);
    }
  };

  // Filter nodes based on current date
  const filterNodesByDate = (node, date) => {
    const hasVisibleTraces = node.traces?.some(t => new Date(t.date) <= date);
    if (node.isLeaf) {
      return hasVisibleTraces ? node : null;
    }
    
    const filteredChildren = node.children
      ?.map(child => filterNodesByDate(child, date))
      .filter(Boolean);
    
    if (!filteredChildren || filteredChildren.length === 0) {
      return hasVisibleTraces ? { ...node, children: [] } : null;
    }
    
    return { ...node, children: filteredChildren };
  };

  const renderSectorsRecursive = (nodes, parentAngleStart, parentAngleEnd, depth, maxDepth, parentColor) => {
    const sectors = [];
    const colors = ['#00BCD4', '#4CAF50', '#FFC107', '#FF5722', '#9C27B0', '#3F51B5'];
    
    const ringWidth = (maxRadius - innerRadius) / Math.max(maxDepth, 1);
    const currentInnerRadius = innerRadius + (depth * ringWidth);
    const currentOuterRadius = innerRadius + ((depth + 1) * ringWidth);
    
    // Filter nodes by date
    const visibleNodes = nodes.map(node => filterNodesByDate(node, currentDate)).filter(Boolean);
    
    if (visibleNodes.length === 0) return sectors;
    
    let currentAngle = parentAngleStart;
    const totalValue = visibleNodes.reduce((sum, node) => {
      const visiblePoints = node.traces
        ?.filter(t => new Date(t.date) <= currentDate)
        .reduce((s, t) => s + t.points, 0) || 0;
      return sum + visiblePoints;
    }, 0);
    
    visibleNodes.forEach((node, index) => {
      const visiblePoints = node.traces
        ?.filter(t => new Date(t.date) <= currentDate)
        .reduce((s, t) => s + t.points, 0) || 0;
      
      if (visiblePoints === 0) return;
      
      const angleSize = totalValue > 0 ? ((visiblePoints / totalValue) * (parentAngleEnd - parentAngleStart)) : 0;
      const endAngle = currentAngle + angleSize;
      
      let nodeColor = depth === 0 ? (node.color || colors[index % colors.length]) : (node.color || parentColor);
      
      sectors.push(
        <CircularSector
          key={`sector-${depth}-${node.id}-${index}`}
          sector={node}
          centerX={centerX}
          centerY={centerY}
          innerRadius={currentInnerRadius}
          outerRadius={currentOuterRadius}
          startAngle={currentAngle}
          endAngle={endAngle}
          color={nodeColor}
          isSelected={selectedNode?.id === node.id}
          isHovered={hoveredSector?.id === node.id}
          onClick={() => handleSectorClick(node)}
          onMouseEnter={() => handleSectorHover(node)}
          onMouseLeave={() => handleSectorHover(null)}
          maxOuterRadius={maxRadius}
          isVisible={true}
        />
      );
      
      if (node.children && node.children.length > 0) {
        const childSectors = renderSectorsRecursive(
          node.children,
          currentAngle,
          endAngle,
          depth + 1,
          maxDepth,
          nodeColor
        );
        sectors.push(...childSectors);
      }
      
      currentAngle = endAngle;
    });
    
    return sectors;
  };

  const renderSectors = () => {
    if (!currentView || !currentView.children || currentView.children.length === 0) return null;
    
    const maxDepth = getMaxDepth(currentView);
    const ringWidth = (maxRadius - innerRadius) / Math.max(maxDepth, 1);
    
    const referenceCircles = [];
    for (let i = 0; i <= maxDepth; i++) {
      const radius = innerRadius + (i * ringWidth);
      referenceCircles.push(
        <circle
          key={`ref-circle-${i}`}
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="#ddd"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
      );
    }
    
    const sectors = renderSectorsRecursive(currentView.children, -90, 270, 0, maxDepth, null);
    
    const depthInfo = (
      <text 
        x={centerX} 
        y={svgSize.height - 10} 
        textAnchor="middle" 
        fontSize="12" 
        fill="#666"
      >
        {currentView.id === data?.root.id ? 'Vue complète' : `Vue: ${currentView.id}`} - Profondeur: {maxDepth} niveau{maxDepth > 1 ? 'x' : ''}
      </text>
    );
    
    return [...referenceCircles, ...sectors, depthInfo];
  };

  if (!data) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  const displayNode = selectedNode || hoveredSector;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="flex flex-1">
        {/* Left Panel - Graph */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 bg-white/80 backdrop-blur border-b">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {data.learner}
                </h1>
                <p className="text-sm text-gray-600">
                  {data.examId} • {data.date}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Réinitialiser"
                >
                  <RotateCcw size={20} />
                </button>
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <Undo2 size={20} />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <Redo2 size={20} />
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-4" ref={svgContainerRef}>
            <div className="relative">
              <svg ref={svgRef} width={svgSize.width} height={svgSize.height} className="bg-white rounded-2xl shadow-2xl">
                <defs>
                  <radialGradient id="centerGradient">
                    <stop offset="0%" stopColor="#4c1d95" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </radialGradient>
                  <radialGradient id="highlightGradient">
                    <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </radialGradient>
                </defs>
                
                <g>{renderSectors()}</g>
                
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={innerRadius}
                  fill="url(#centerGradient)"
                  stroke="white"
                  strokeWidth="3"
                  style={{ cursor: 'pointer' }}
                  onClick={handleReset}
                />
              </svg>
            </div>
          </div>

          {/* Metadata Stats - Synchronized with timeline */}
          {data.metadata && (
            <div className="p-4 bg-white/80 backdrop-blur border-t">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-green-500" size={20} />
                  <div>
                    <p className="text-xs text-gray-600">Progression</p>
                    <p className="text-lg font-bold text-green-600">
                      {(() => {
                        // Calculate progression based on current date
                        const visibleTraces = data.root.traces.filter(t => new Date(t.date) <= currentDate);
                        const totalPossible = data.root.traces.length;
                        const percentage = totalPossible > 0 ? Math.round((visibleTraces.length / totalPossible) * 100) : 0;
                        return `${percentage}%`;
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="text-blue-500" size={20} />
                  <div>
                    <p className="text-xs text-gray-600">Heures de formation</p>
                    <p className="text-lg font-bold">
                      {(() => {
                        // Calculate hours based on visible traces
                        const visiblePoints = data.root.traces
                          .filter(t => new Date(t.date) <= currentDate)
                          .reduce((sum, t) => sum + t.points, 0);
                        return `${(visiblePoints / 10).toFixed(1)}h`;
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="text-purple-500" size={20} />
                  <div>
                    <p className="text-xs text-gray-600">Activités réalisées</p>
                    <p className="text-lg font-bold">
                      {data.root.traces.filter(t => new Date(t.date) <= currentDate).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Tree and Info */}
        <div className="w-96 flex flex-col bg-white/90 backdrop-blur border-l">
          {/* Info Panel */}
          <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
            {displayNode ? (
              <div>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  {displayNode.niveau > 0 && (
                    <span title={niveaux[displayNode.niveau]?.nom}>
                      {niveaux[displayNode.niveau]?.icon}
                    </span>
                  )}
                  {displayNode.id}
                </h2>
                
                {displayNode.description && (
                  <p className="text-sm text-gray-600 mb-3 italic">
                    {displayNode.description}
                  </p>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Sparkles size={16} className="text-yellow-500" />
                      Points d'expérience
                    </span>
                    <span className="text-lg font-bold text-blue-600">
                      {Math.round(displayNode.traces?.filter(t => new Date(t.date) <= currentDate).reduce((s, t) => s + t.points, 0) || 0)}
                    </span>
                  </div>
                  
                  {displayNode.traces && displayNode.traces.length > 0 && (
                    <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Link size={16} className="text-green-500" />
                        Traces d'apprentissage
                      </span>
                      <span className="text-sm font-bold">
                        {displayNode.traces.filter(t => new Date(t.date) <= currentDate).length}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Info className="mx-auto mb-3 text-gray-400" size={32} />
                <p className="text-gray-500 mb-2">Explorez votre cartographie</p>
                <p className="text-xs text-gray-400">
                  Cliquez sur un groupe pour zoomer
                </p>
              </div>
            )}
          </div>

          {/* Tree View */}
          <div className="flex-1 overflow-auto p-4">
            <h3 className="font-semibold mb-3 text-gray-700">
              Arborescence des compétences
            </h3>
            {currentView && (
              <div className="px-2 pb-2 mb-2 border-b">
                <span className="text-sm text-gray-600">Vue actuelle: </span>
                <span className="text-sm font-semibold">{currentView.id}</span>
              </div>
            )}
            {data && (
              <TreeNode 
                node={data.root}
                onSelect={handleNodeSelect}
                selectedId={selectedNode?.id}
                currentView={currentView}
                hoveredId={hoveredSector?.id}
                expandedNodes={expandedNodes}
                onToggle={handleToggleNode}
                currentDate={currentDate}
                showTraces={showTraces}
                onToggleTraces={handleToggleTraces}
              />
            )}
          </div>
        </div>
      </div>
      
      {/* Bottom Panel - Calendar and Timeline */}
      <div className="border-t bg-white">
        {/* Timeline and year selector */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Progression temporelle</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const newYear = selectedYear - 1;
                  setSelectedYear(newYear);
                  // Keep the same day/month but change year
                  const newDate = new Date(currentDate);
                  newDate.setFullYear(newYear);
                  handleDateChange(newDate);
                }}
                className="text-sm text-gray-600 hover:text-blue-600 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
              >
                ← {selectedYear - 1}
              </button>
              <div className="px-3 py-1 bg-blue-600 text-white rounded-md font-bold text-sm min-w-[60px] text-center">
                {selectedYear}
              </div>
              <button
                onClick={() => {
                  const newYear = selectedYear + 1;
                  setSelectedYear(newYear);
                  // Keep the same day/month but change year
                  const newDate = new Date(currentDate);
                  newDate.setFullYear(newYear);
                  handleDateChange(newDate);
                }}
                className="text-sm text-gray-600 hover:text-blue-600 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
              >
                {selectedYear + 1} →
              </button>
            </div>
          </div>
        </div>
        
        {/* Timeline controls */}
        <div className="p-4 border-b bg-gray-50">
          <Timeline
            startDate={dateRange.start}
            endDate={dateRange.end}
            currentDate={currentDate}
            onDateChange={handleDateChange}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onReverse={handleReverse}
          />
        </div>
        
        {/* GitHub Calendar */}
        <div className="p-6 bg-gray-50">
          <div className="text-sm text-gray-600 mb-4">Activité d'apprentissage</div>
          <GitHubCalendar 
            data={data}
            currentDate={currentDate}
            onDateClick={handleDateChange}
            selectedYear={selectedYear}
          />
        </div>
      </div>
    </div>
  );
};

export default CartographyViewer;