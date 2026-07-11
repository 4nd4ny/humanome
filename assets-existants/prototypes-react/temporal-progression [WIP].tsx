import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// Fonction de correction d'encodage UTF-8
const fixUTF8Encoding = (text) => {
  if (!text) return text;
  
  const corrections = {
    'ÃƒÂ©': 'é', 'Ã©': 'é', 'ÃƒÂ¨': 'è', 'Ã¨': 'è', 'Ãƒ ': 'à', 'Ã ': 'à',
    'ÃƒÂ´': 'ô', 'Ã´': 'ô', 'ÃƒÂ¢': 'â', 'Ã¢': 'â', 'ÃƒÂª': 'ê', 'Ãª': 'ê',
    'ÃƒÂ®': 'î', 'Ã®': 'î', 'ÃƒÂ§': 'ç', 'Ã§': 'ç', 'ÃƒÂ¹': 'ù', 'Ã¹': 'ù',
    'ÃƒÂ»': 'û', 'Ã»': 'û', 'ÃƒÂ¯': 'ï', 'Ã¯': 'ï', 'ÃƒÂ«': 'ë', 'Ã«': 'ë',
    'Ãƒ€': 'À', 'Ãƒ‰': 'É', 'ÃƒË†': 'È', 'Ãƒ"': 'Ô', 'Ãƒ‚': 'Â', 'ÃƒÅ ': 'Ê',
    'ÃƒÅ½': 'Î', 'Ãƒ‡': 'Ç', 'Ãƒ™': 'Ù', 'Ãƒ›': 'Û', 'Ãƒ': 'Ï', 'Ãƒ‹': 'Ë',
  };
  
  let correctedText = text;
  for (const [bad, good] of Object.entries(corrections)) {
    correctedText = correctedText.replace(new RegExp(bad, 'g'), good);
  }
  
  return correctedText;
};

const TemporalProgressionViewer = () => {
  const [xmlData, setXmlData] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date('2024-01-01'));
  const [selectedYear, setSelectedYear] = useState(2024);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playDirection, setPlayDirection] = useState(1);
  const [availableYears, setAvailableYears] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const animationRef = useRef(null);
  
  // Ajouts pour sélection, ref calendrier, et taille dynamique des cases
  const [selectedDate, setSelectedDate] = useState(null);
  const calendarRef = useRef(null);
  const [cellSize, setCellSize] = useState(11);

  // Générer des données de test
  const generateSampleData = () => {
    const domains = [
      { name: 'Cognitif et Métacognitif', color: '#2563eb' },
      { name: 'Socio-Émotionnel', color: '#10b981' },
      { name: 'Technique et Numérique', color: '#06b6d4' },
      { name: 'Éthique et Philosophie', color: '#8b5cf6' },
      { name: 'Existentiel et Adaptatif', color: '#f59e0b' },
      { name: 'Créativité et Design', color: '#ec4899' }
    ];

    const competences = {
      'Cognitif et Métacognitif': ['Analyse critique', 'Détection de biais', 'Validation d\'information', 'Décomposition', 'Solutions créatives'],
      'Socio-Émotionnel': ['Reconnaissance émotionnelle', 'Régulation émotionnelle', 'Empathie active', 'Travail d\'équipe', 'Communication claire'],
      'Technique et Numérique': ['Utilisation d\'IA', 'Prompt engineering', 'Python basique', 'Analyse de données', 'Automatisation'],
      'Éthique et Philosophie': ['Analyse éthique', 'Dilemmes moraux', 'Éthique de l\'IA', 'Responsabilité numérique'],
      'Existentiel et Adaptatif': ['Gestion du stress', 'Adaptation au changement', 'Croissance par l\'échec', 'Pleine conscience'],
      'Créativité et Design': ['Génération d\'idées', 'Pensée latérale', 'Co-création avec IA', 'Prototypage rapide']
    };

    const types = [
      'ANALYSE', 'PRATIQUE', 'PROJET', 'FORMATION', 'EXERCICE', 
      'CRÉATION', 'RÉFLEXION', 'COLLABORATION', 'ÉVALUATION', 'PRÉSENTATION'
    ];

    const traces = [];
    let traceId = 1;

    // Générer des activités sur toute l'année 2024
    for (let month = 0; month < 12; month++) {
      const activitiesInMonth = Math.floor(Math.random() * 10) + 5; // 5-14 activités par mois
      
      for (let i = 0; i < activitiesInMonth; i++) {
        const domain = domains[Math.floor(Math.random() * domains.length)];
        const competenceList = competences[domain.name];
        const competence = competenceList[Math.floor(Math.random() * competenceList.length)];
        
        const day = Math.floor(Math.random() * 28) + 1;
        const date = new Date(2024, month, day);
        
        traces.push({
          id: `T${String(traceId).padStart(3, '0')}`,
          date: date.toISOString().split('T')[0],
          points: Math.floor(Math.random() * 20) + 5, // 5-24 points
          description: `${competence} - Activité ${traceId}`,
          type: types[Math.floor(Math.random() * types.length)],
          url: `/portfolio/activity-${traceId}`,
          competence: competence,
          domain: domain.name,
          domainColor: domain.color
        });
        
        traceId++;
      }
    }

    // Trier par date
    traces.sort((a, b) => new Date(a.date) - new Date(b.date));
    return traces;
  };

  useEffect(() => {
    // Charger les données de test
    const traces = generateSampleData();
    setXmlData(traces);
    
    if (traces.length > 0) {
      const years = [...new Set(traces.map(trace => new Date(trace.date).getFullYear()))].sort();
      setAvailableYears(years);
      
      // Définir la date courante à la fin de l'année pour voir toutes les activités
      setCurrentDate(new Date('2024-12-31'));
      setSelectedYear(2024);
    }
  }, []);

  const dateRange = useMemo(() => {
    if (!xmlData || xmlData.length === 0) {
      return { start: new Date('2024-01-01'), end: new Date('2024-12-31') };
    }
    const firstDate = new Date(xmlData[0].date);
    const lastDate = new Date(xmlData[xmlData.length - 1].date);
    const start = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    const end = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0);
    return { start, end };
  }, [xmlData]);

  // Créer la carte d'activités CORRIGÉE
  const activityMap = useMemo(() => {
    if (!xmlData) return {};
    const map = {};
    
    xmlData.forEach(trace => {
      const pivot = selectedDate ?? currentDate;
      const pivot = selectedDate ?? currentDate;
      // CORRECTION : afficher les activités JUSQU'À la date pivot (pas après)
      if (new Date(trace.date) <= pivot) {
        const dateStr = trace.date;
        if (!map[dateStr]) {
          map[dateStr] = { 
            count: 0, 
            points: 0, 
            traces: [], 
            domains: new Set(), 
            colors: [] 
          };
        }
        map[dateStr].count++;
        map[dateStr].points += trace.points;
        map[dateStr].traces.push(trace);
        map[dateStr].domains.add(trace.domainColor);
        map[dateStr].colors.push(trace.domainColor);
      }
    });
    
    // Déterminer la couleur pour chaque jour
    Object.keys(map).forEach(dateStr => {
      const dayData = map[dateStr];
      if (dayData.domains.size === 1) {
        // Un seul domaine - utiliser la couleur du domaine
        dayData.color = Array.from(dayData.domains)[0];
      } else {
        // Plusieurs domaines - utiliser une échelle de gris
        const intensity = Math.min(dayData.count / 5, 1);
        const grayValue = Math.round(220 - (intensity * 70)); // De gris clair à gris foncé
        dayData.color = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
        dayData.isMultiDomain = true;
      }
    });
    
    return map;
  }, [xmlData, currentDate, selectedDate]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = setInterval(() => {
        setCurrentDate(prevDate => {
          const newDate = new Date(prevDate);
          newDate.setDate(newDate.getDate() + (playDirection * 2)); // Accélérer un peu l'animation
          if ((playDirection > 0 && newDate > dateRange.end) || (playDirection < 0 && newDate < dateRange.start)) {
            setIsPlaying(false);
            return playDirection > 0 ? dateRange.end : dateRange.start;
          }
          return newDate;
        });
      }, 50); // Plus rapide pour la démo
      return () => clearInterval(animationRef.current);
    }
  }, [isPlaying, playDirection, dateRange]);

  const calendarGrid = useMemo(() => {
    const grid = [];
    const year = selectedYear;
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    
    // Trouver le premier dimanche de l'année (ou le dernier dimanche de l'année précédente)
    const firstSunday = new Date(jan1);
    const dayOfWeek = jan1.getDay();
    firstSunday.setDate(jan1.getDate() - dayOfWeek);
    
    let currentDateIter = new Date(firstSunday);
    
    // Calculer le nombre de semaines nécessaires
    const lastSunday = new Date(dec31);
    lastSunday.setDate(dec31.getDate() + (6 - dec31.getDay()));
    const weekCount = Math.ceil((lastSunday - firstSunday) / (7 * 24 * 60 * 60 * 1000)) + 1;
    
    for (let week = 0; week < weekCount; week++) {
      const weekDays = [];
      for (let day = 0; day < 7; day++) {
        const dateStr = currentDateIter.toISOString().split('T')[0];
        const isInYear = currentDateIter.getFullYear() === year;
        
        weekDays.push({
          date: new Date(currentDateIter),
          dateStr: dateStr,
          activity: activityMap[dateStr] || null,
          isInYear: isInYear,
          isFuture: currentDateIter > (selectedDate ?? currentDate),
          month: currentDateIter.getMonth(),
          day: currentDateIter.getDate()
        });
        currentDateIter.setDate(currentDateIter.getDate() + 1);
      }
      grid.push(weekDays);
    }
    return grid;
  }, [selectedYear, activityMap, currentDate, selectedDate]);

  // Calcul responsive de la taille des carrés de la heatmap
  useEffect(() => {
    const computeCellSize = () => {
      if (!calendarRef.current || calendarGrid.length === 0) return;
      const containerWidth = calendarRef.current.clientWidth;
      const leftLabels = 38; // padding + labels
      const weeks = calendarGrid.length;
      const gaps = weeks > 0 ? (weeks - 1) * 2 : 0; // 3px gap between weeks
      const usable = Math.max(0, containerWidth - leftLabels - gaps - 20); // 20px de marge
      const size = Math.floor(usable / Math.max(1, weeks));
      setCellSize(Math.max(10, Math.min(size, 13)));
    };
    computeCellSize();
    window.addEventListener('resize', computeCellSize);
    return () => window.removeEventListener('resize', computeCellSize);
  }, [calendarGrid]);

  // Calculer les positions des labels de mois
  const monthLabels = useMemo(() => {
    const labels = [];
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    
    if (calendarGrid.length === 0) return labels;
    
    let currentMonth = -1;
    calendarGrid.forEach((week, weekIndex) => {
      week.forEach(day => {
        if (day.isInYear && day.day === 1 && day.month !== currentMonth) {
          currentMonth = day.month;
          labels.push({
            month: months[day.month],
            weekIndex: weekIndex
          });
        }
      });
    });
    
    return labels;
  }, [calendarGrid]);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setPlayDirection(1);
      setIsPlaying(true);
    }
  };

  const handleReverse = () => {
    setPlayDirection(-1);
    setIsPlaying(true);
  };

  const handleSliderChange = (e) => {
    const percentage = parseFloat(e.target.value);
    const timeDiff = dateRange.end.getTime() - dateRange.start.getTime();
    const newDateTime = dateRange.start.getTime() + (timeDiff * percentage / 100);
    setCurrentDate(new Date(newDateTime));
    setIsPlaying(false);
  };

  const handleDateClick = (date) => {
  const end = dateRange.end;
  if (date <= end) {
    setSelectedDate(date);
    setCurrentDate(date);
    setSelectedYear(date.getFullYear());
    setIsPlaying(false);
  }
};

  const sliderPercentage = useMemo(() => {
    const totalDuration = dateRange.end - dateRange.start;
    const currentDuration = currentDate - dateRange.start;
    if (totalDuration === 0) return 0;
    return Math.max(0, Math.min(100, (currentDuration / totalDuration) * 100));
  }, [currentDate, dateRange]);

  const stats = useMemo(() => {
    if (!xmlData) return { total: 0, visible: 0, points: 0 };
    const pivot = selectedDate ?? currentDate;
    // CORRECTION : compter les activités jusqu'à la date pivot
    const visible = xmlData.filter(t => new Date(t.date) <= pivot);
    return {
      total: xmlData.length,
      visible: visible.length,
      points: visible.reduce((sum, t) => sum + t.points, 0)
    };
  }, [xmlData, currentDate, selectedDate]);

  const handleActivityClick = (trace) => {
    const d = new Date(trace.date);
    setSelectedDate(d);
    setCurrentDate(d);
    setSelectedYear(d.getFullYear());
    setIsPlaying(false);
  };

  const dayLabels = ['', 'Lun', '', 'Mer', '', 'Ven', ''];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Chargement des données...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white font-sans max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Progression Temporelle des Compétences
        </h2>
        <p className="text-gray-600">
          <span className="font-semibold">{stats.visible}</span> / {stats.total} activités réalisées • 
          <span className="font-semibold ml-2">{Math.round(stats.points)}</span> points acquis
        </p>
      </div>

      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={handleReverse} 
            className="p-2 hover:bg-white rounded-full transition-all shadow-sm hover:shadow-md" 
            title="Rembobiner"
          >
            <SkipBack size={20} />
          </button>
          <button 
            onClick={handlePlayPause} 
            className="p-3 bg-white hover:bg-gray-50 rounded-full transition-all shadow-md hover:shadow-lg" 
            title={isPlaying ? "Pause" : "Lecture"}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button 
            onClick={() => handleDateClick(dateRange.end)} 
            className="p-2 hover:bg-white rounded-full transition-all shadow-sm hover:shadow-md" 
            title="Aller à la fin"
          >
            <SkipForward size={20} />
          </button>
          
          <div className="flex-1 px-4">
            <input 
              type="range" 
              min="0" 
              max="100" 
              step="0.1" 
              value={sliderPercentage} 
              onChange={handleSliderChange} 
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #3b82f6 ${sliderPercentage}%, #e5e7eb ${sliderPercentage}%)`
              }}
            />
          </div>
          
          <div className="text-sm font-medium text-gray-700 w-32 text-right bg-white px-3 py-1 rounded-lg shadow-sm">
            {currentDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>

        {availableYears.length > 1 && (
          <div className="flex justify-center items-center gap-2">
            <button 
              onClick={() => setSelectedYear(y => Math.max(availableYears[0], y - 1))} 
              disabled={selectedYear === availableYears[0]} 
              className="p-1 disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-semibold text-lg">{selectedYear}</span>
            <button 
              onClick={() => setSelectedYear(y => Math.min(availableYears[availableYears.length - 1], y + 1))} 
              disabled={selectedYear === availableYears[availableYears.length - 1]} 
              className="p-1 disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Calendrier style GitHub */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 overflow-x-auto">
        <div ref={calendarRef} className="w-full">
          {/* Labels des mois */}
          <div className="flex mb-2" style={{ paddingLeft: '30px', position: 'relative', height: '20px' }}>
            {monthLabels.map((label, i) => (
              <div 
                key={i} 
                className="text-xs text-gray-700"
                style={{ 
                  position: 'absolute',
                  left: `${30 + label.weekIndex * (cellSize + 3)}px`
                }}
              >
                {label.month}
              </div>
            ))}
          </div>
          
          {/* Grille du calendrier */}
          <div className="flex gap-[3px]" style={{ marginTop: '20px' }}>
            {/* Labels des jours */}
            <div className="flex flex-col gap-[3px] mr-2 text-[10px] text-gray-600">
              {dayLabels.map((day, i) => (
                <div 
                  key={i} 
                  className="text-[10px] text-gray-600 text-right pr-1" 
                  style={{ height: `${cellSize}px`, width: '24px', lineHeight: `${cellSize}px` }}
                >
                  {day}
                </div>
              ))}
            </div>
            
            {/* Cases du calendrier */}
            <div className="flex gap-[3px]">
              {calendarGrid.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {week.map((day, dayIndex) => {
                    const isSelected = day.dateStr === (selectedDate ?? currentDate).toISOString().split('T')[0];
                    
                    let bgColor = '#ebedf0'; // Gris clair par défaut pour les cases vides
                    let opacity = 1;
                    let borderColor = 'rgba(27, 31, 35, 0.06)';

                    if (!day.isInYear) {
                      // Jours hors de l'année - invisibles
                      return <div key={dayIndex} style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />;
                    }
                    
                    // Masquer tous les jours POSTÉRIEURS à la date sélectionnée (si sélection active)
                    if (selectedDate && day.date > selectedDate) {
                      return <div key={dayIndex} style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />;
                    }
                    style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />;
                    }

                    if (day.isFuture) {
                      // Dates futures - blanches avec bordure
                      bgColor = '#ffffff';
                      borderColor = '#d1d5db';
                    } else if (day.activity) {
                      // AMÉLIORATION : utiliser les vraies couleurs de domaines
                      if (day.activity.isMultiDomain) {
                        // Plusieurs domaines - gris avec intensité
                        bgColor = day.activity.color;
                      } else {
                        // Un seul domaine - couleur du domaine avec opacité basée sur les points
                        bgColor = day.activity.color;
                        const intensity = Math.min(day.activity.points / 30, 1);
                        opacity = 0.7 + (intensity * 0.3); // Range: 0.7 à 1.0
                      }
                    }
                    
                    return (
                      <div 
                        key={dayIndex} 
                        className={`rounded-sm cursor-pointer transition-all ${
                          isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                        } hover:outline hover:outline-1 hover:outline-gray-400`}
                        style={{ 
                          width: `${cellSize}px`, 
                          height: `${cellSize}px`, 
                          backgroundColor: bgColor, 
                          opacity: opacity,
                          border: `1px solid ${borderColor}`,
                          outline: isSelected ? '2px solid #1f6feb' : 'none',
                          outlineOffset: isSelected ? '1px' : '0'
                        }} 
                        title={`${day.date.toLocaleDateString('fr-FR')}: ${
                          day.activity 
                            ? day.activity.isMultiDomain
                              ? `${day.activity.count} activités (domaines multiples), ${Math.round(day.activity.points)} points`
                              : `${day.activity.count} activité(s), ${Math.round(day.activity.points)} points` 
                            : day.isFuture 
                              ? 'Date future' 
                              : 'Aucune activité'
                        }`} 
                        onClick={() => handleDateClick(day.date)} 
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          
          {/* Légende améliorée */}
          <div className="flex items-center gap-6 mt-4 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span>Intensité:</span>
              <div className="flex gap-[2px]">
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#ebedf0', 
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Aucune activité"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#cbd5e0', 
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Multi-domaines faible"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#a0aec0', 
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Multi-domaines moyen"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#718096', 
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Multi-domaines élevé"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#4a5568', 
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Multi-domaines très élevé"
                />
              </div>
              <span>Plus</span>
            </div>
            
            <div className="flex items-center gap-2">
              <span>Domaines:</span>
              <div className="flex gap-[2px]">
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#2563eb', 
                    opacity: 0.8,
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Cognitif"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#10b981', 
                    opacity: 0.8,
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Socio-Émotionnel"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#06b6d4', 
                    opacity: 0.8,
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Technique"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#8b5cf6', 
                    opacity: 0.8,
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Éthique"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#f59e0b', 
                    opacity: 0.8,
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Existentiel"
                />
                <div 
                  className="rounded-sm"
                  style={{ 
                    width: `${cellSize}px`, 
                    height: `${cellSize}px`, 
                    backgroundColor: '#ec4899', 
                    opacity: 0.8,
                    border: '1px solid rgba(27, 31, 35, 0.06)' 
                  }} 
                  title="Créativité"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des activités CORRIGÉE */}
      {xmlData && (
        <div className="mt-6 border-t pt-4">
          <h3 className="text-lg font-semibold mb-3">
            {selectedDate ? <>Activités à partir du {(selectedDate ?? currentDate).toLocaleDateString('fr-FR')}</> : <>Activités jusqu'au {(selectedDate ?? currentDate).toLocaleDateString('fr-FR')}</>}
            {selectedDate && (
              <button 
                onClick={() => setSelectedDate(null)}
                className="ml-3 text-sm font-normal text-blue-600 hover:text-blue-800"
              >
                (Mode sélection actif - Réinitialiser)
              </button>
            )}
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {xmlData
              .filter(trace => selectedDate ? new Date(trace.date) >= (selectedDate ?? currentDate) : new Date(trace.date) <= (selectedDate ?? currentDate))
              .sort((a, b) => selectedDate ? (new Date(a.date) - new Date(b.date)) : (new Date(b.date) - new Date(a.date)))ntes en premier
              .slice(0, 50)
              .map(trace => (
                <div 
                  key={trace.id} 
                  className="flex items-center gap-3 p-3 bg-gradient-to-r from-gray-50 to-white rounded-lg hover:shadow-md transition-all cursor-pointer border border-gray-100" 
                  onClick={() => handleActivityClick(trace)}
                >
                  <div 
                    className="w-4 h-4 rounded flex-shrink-0 shadow-sm" 
                    style={{ backgroundColor: trace.domainColor }} 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{trace.description}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(trace.date).toLocaleDateString('fr-FR')} • {trace.competence} • 
                      <span className="font-semibold ml-1">{trace.points} points</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0 bg-gray-100 px-2 py-1 rounded">
                    {trace.type}
                  </div>
                </div>
            ))}
          </div>
          {xmlData.filter(trace => new Date(trace.date) <= currentDate).length > 50 && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Affichage des 50 dernières activités sur {xmlData.filter(trace => new Date(trace.date) <= currentDate).length}
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: #3b82f6;
          cursor: pointer;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #3b82f6;
          cursor: pointer;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          border: none;
        }
      `}</style>
    </div>
  );
};

export default TemporalProgressionViewer;