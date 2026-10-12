import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  Network,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ShieldCheck,
  User,
  Sparkles,
  FolderGit2,
  CheckCircle2,
  ChevronRight,
  Filter,
  Layers,
  Info,
  ExternalLink,
  ArrowRight,
  Compass,
  Check
} from 'lucide-react';
import type { Employee, GraphLink, GraphNode } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import { getEmployeeDisplayLabel } from '../../utils/employeeDisplay';

const toPersonNodeId = (id: string) => id ? (id.startsWith('emp-') ? id : `emp-${id}`) : '';

interface SkillGraphTabProps {
  employees: Employee[];
  currentEmployee?: Employee | null;
  onInspectEvidence: (employee: Employee, skillName: string) => void;
}

const WIDTH = 1200;
const HEIGHT = 760;

// Refined organic force simulation for aesthetic clustering and clean node spacing
function forceLayout(nodes: GraphNode[], links: GraphLink[]): GraphNode[] {
  // Categorical radius initialization: Skills near center, People in inner orbit, Projects in outer orbit
  const positioned = nodes.map((node, index) => {
    let baseRadius = 80;
    if (node.type === 'Skill') baseRadius = 120 + (index % 12) * 22;
    else if (node.type === 'Person') baseRadius = 240 + (index % 16) * 18;
    else if (node.type === 'Project') baseRadius = 320 + (index % 10) * 25;

    const angle = (index * 2.399963229728653) + (node.type === 'Skill' ? 0 : node.type === 'Person' ? 1.2 : 2.4);
    return {
      ...node,
      x: WIDTH / 2 + Math.cos(angle) * baseRadius,
      y: HEIGHT / 2 + Math.sin(angle) * baseRadius,
      vx: 0,
      vy: 0
    };
  });

  const byId = new Map(positioned.map(node => [node.id, node]));

  // Iterative relaxation passes
  for (let pass = 0; pass < 120; pass++) {
    // 1. Repulsion between all node pairs
    for (let i = 0; i < positioned.length; i++) {
      const left = positioned[i];
      for (let j = i + 1; j < positioned.length; j++) {
        const right = positioned[j];
        let dx = (right.x || 0) - (left.x || 0);
        let dy = (right.y || 0) - (left.y || 0);
        let distance = Math.hypot(dx, dy) || 0.01;
        const minDistance = (left.val || 12) + (right.val || 12) + 38;

        if (distance < minDistance) {
          const push = (minDistance - distance) * 0.085;
          dx /= distance;
          dy /= distance;
          left.x = (left.x || 0) - dx * push;
          left.y = (left.y || 0) - dy * push;
          right.x = (right.x || 0) + dx * push;
          right.y = (right.y || 0) + dy * push;
        } else {
          const push = 1200 / (distance * distance);
          dx /= distance;
          dy /= distance;
          left.x = (left.x || 0) - dx * push;
          left.y = (left.y || 0) - dy * push;
          right.x = (right.x || 0) + dx * push;
          right.y = (right.y || 0) + dy * push;
        }
      }
    }

    // 2. Attraction along connected links
    links.forEach(link => {
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      if (!source || !target) return;
      const dx = (target.x || 0) - (source.x || 0);
      const dy = (target.y || 0) - (source.y || 0);
      const distance = Math.hypot(dx, dy) || 1;
      const desired = 110 + (source.val || 12) + (target.val || 12);
      const pull = (distance - desired) * 0.012;

      source.x = (source.x || 0) + (dx / distance) * pull;
      source.y = (source.y || 0) + (dy / distance) * pull;
      target.x = (target.x || 0) - (dx / distance) * pull;
      target.y = (target.y || 0) - (dy / distance) * pull;
    });

    // 3. Gentle gravitational pull toward canvas center
    positioned.forEach(node => {
      const dx = WIDTH / 2 - (node.x || 0);
      const dy = HEIGHT / 2 - (node.y || 0);
      node.x = (node.x || 0) + dx * 0.002;
      node.y = (node.y || 0) + dy * 0.002;

      // Keep within canvas bounds
      const margin = 50;
      node.x = Math.max(margin, Math.min(WIDTH - margin, node.x || 0));
      node.y = Math.max(margin, Math.min(HEIGHT - margin, node.y || 0));
    });
  }

  return positioned;
}

export const SkillGraphTab: React.FC<SkillGraphTabProps> = ({
  employees,
  currentEmployee,
  onInspectEvidence
}) => {
  const [scope, setScope] = useState<'my' | 'all'>(() => (currentEmployee ? 'my' : 'all'));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    if (currentEmployee) {
      return currentEmployee.skills[0]?.skillId || toPersonNodeId(currentEmployee.id);
    }
    return 'skill-react';
  });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<'All' | 'Person' | 'Skill' | 'Project'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const empSkillIds = useMemo(() => new Set(currentEmployee?.skills.map(s => s.skillId) || []), [currentEmployee]);

  // Construct complete knowledge graph from employees, skills, and projects
  const graph = useMemo(() => {
    const uniqueEmployees = [...new Map(employees.map(employee => [employee.id, employee])).values()];
    const nodeMap = new Map<string, GraphNode>();
    const linkMap = new Map<string, GraphLink>();

    // 1. Skill Nodes
    CSV_DATA.skillsData.forEach(skill => {
      nodeMap.set(skill.id, {
        id: skill.id,
        label: skill.name,
        type: 'Skill',
        category: skill.category,
        val: 16
      });
    });

    // 2. Person Nodes - exactly one node per employee, keyed by canonical id, unique display labels
    uniqueEmployees.forEach(employee => {
      const pId = toPersonNodeId(employee.id);
      nodeMap.set(pId, {
        id: pId,
        label: employee.display_label || getEmployeeDisplayLabel(employee, uniqueEmployees),
        type: 'Person',
        category: employee.role,
        val: 14
      });
    });

    // 3. Project Nodes
    (CSV_DATA.records.projects || []).forEach(project => {
      nodeMap.set(project.project_id, {
        id: project.project_id,
        label: project.project_name,
        type: 'Project',
        category: project.domain || 'Initiative',
        val: 18
      });
    });

    const addLink = (link: GraphLink) => {
      const key = [link.source, link.target].sort().join(':');
      if (link.source !== link.target) {
        linkMap.set(key, link);
      }
    };

    // Employee -> Skills links
    uniqueEmployees.forEach(employee => {
      const pId = toPersonNodeId(employee.id);
      employee.skills.forEach(skill => {
        if (nodeMap.has(skill.skillId)) {
          addLink({ source: pId, target: skill.skillId });
        }
      });
    });

    // Employee -> Projects links
    (CSV_DATA.records.employeeProjects || []).forEach(ep => {
      const pId = toPersonNodeId(ep.employee_id);
      if (nodeMap.has(pId) && nodeMap.has(ep.project_id)) {
        addLink({ source: pId, target: ep.project_id });
      }
    });

    // Project -> Technologies/Skills links
    (CSV_DATA.records.projects || []).forEach(project => {
      (project.technologies || '').split('|').filter(Boolean).forEach(techName => {
        const found = CSV_DATA.skillsData.find(
          s => s.name.toLowerCase() === techName.toLowerCase() ||
               s.synonyms.some(a => a.toLowerCase() === techName.toLowerCase())
        );
        if (found && nodeMap.has(found.id)) {
          addLink({ source: project.project_id, target: found.id });
        }
      });
    });

    return { nodes: [...nodeMap.values()], links: [...linkMap.values()] };
  }, [employees]);

  // Current employee's 2-hop neighborhood for personal network scope
  const myNetworkNodeIds = useMemo(() => {
    if (!currentEmployee) return new Set<string>();
    const ids = new Set<string>();
    const meId = toPersonNodeId(currentEmployee.id);
    ids.add(meId);

    // 1st hop: direct skills and projects
    graph.links.forEach(link => {
      if (link.source === meId) ids.add(link.target);
      if (link.target === meId) ids.add(link.source);
    });

    // 2nd hop: teammates on same projects or sharing same verified skills
    const firstHop = new Set(ids);
    graph.links.forEach(link => {
      if (firstHop.has(link.source)) ids.add(link.target);
      if (firstHop.has(link.target)) ids.add(link.source);
    });

    return ids;
  }, [currentEmployee, graph.links]);

  // Categories list for quick filtering
  const categories = useMemo(() => {
    const set = new Set<string>();
    graph.nodes.forEach(n => {
      if (n.category) set.add(n.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [graph.nodes]);

  // Filter nodes according to scope, type, category, and search query
  const filteredNodes = useMemo(() => {
    return graph.nodes.filter(node => {
      if (scope === 'my' && currentEmployee && !myNetworkNodeIds.has(node.id)) return false;
      if (nodeTypeFilter !== 'All' && node.type !== nodeTypeFilter) return false;
      if (selectedCategory !== 'All' && node.category !== selectedCategory) return false;

      if (!searchQuery.trim()) return true;
      const qTokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const searchable = `${node.label} ${node.category || ''} ${node.type}`.toLowerCase();
      return qTokens.every(tok => searchable.includes(tok));
    });
  }, [graph.nodes, scope, currentEmployee, myNetworkNodeIds, nodeTypeFilter, selectedCategory, searchQuery]);

  const visibleIds = useMemo(() => new Set(filteredNodes.map(node => node.id)), [filteredNodes]);
  const visibleLinks = useMemo(() => {
    return graph.links.filter(link => visibleIds.has(link.source) && visibleIds.has(link.target));
  }, [graph.links, visibleIds]);

  const visibleNodes = useMemo(() => forceLayout(filteredNodes, visibleLinks), [filteredNodes, visibleLinks]);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const positionedById = useMemo(() => new Map(visibleNodes.map(node => [node.id, node])), [visibleNodes]);

  const selectedNode = useMemo(() => graph.nodes.find(node => node.id === selectedNodeId) || null, [graph.nodes, selectedNodeId]);

  // Connected nodes set for highlight paths
  const selectedConnectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const connected = new Set<string>([selectedNodeId]);
    graph.links.forEach(link => {
      if (link.source === selectedNodeId) connected.add(link.target);
      if (link.target === selectedNodeId) connected.add(link.source);
    });
    return connected;
  }, [selectedNodeId, graph.links]);

  // Connected employees for selected skill
  const connectedEmployeesForSkill = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'Skill') return [];
    return employees.filter(emp => emp.skills.some(s => s.skillId === selectedNode.id));
  }, [selectedNode, employees]);

  // Connected projects for selected skill
  const connectedProjectsForSkill = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'Skill') return [];
    const skillName = selectedNode.label.toLowerCase();
    return (CSV_DATA.records.projects || []).filter(p =>
      (p.technologies || '').toLowerCase().includes(skillName)
    );
  }, [selectedNode]);

  const selectedEmployee = selectedNode?.type === 'Person'
    ? employees.find(emp => toPersonNodeId(emp.id) === selectedNode.id)
    : undefined;

  const selectedProject = selectedNode?.type === 'Project'
    ? (CSV_DATA.records.projects || []).find(p => p.project_id === selectedNode.id)
    : undefined;

  const zoomBy = (amount: number) => {
    setZoom(v => Math.min(2.8, Math.max(0.5, Number((v + amount).toFixed(2)))));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCenterOnNode = useCallback((node: GraphNode) => {
    const target = positionedById.get(node.id);
    if (!target) return;
    const targetZoom = 1.35;
    setZoom(targetZoom);
    setPan({
      x: (WIDTH / 2 - (target.x || 0)) * targetZoom,
      y: (HEIGHT / 2 - (target.y || 0)) * targetZoom
    });
  }, [positionedById]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ── Top Header & Stats Summary ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Network className="h-4.5 w-4.5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Enterprise Skill &amp; Ontology Graph
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Explore verified competencies, project applications, and cross-functional employee connections across the organization.
          </p>
        </div>

        {/* Live Graph Metrics */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs shadow-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {visibleNodes.length} Nodes
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {visibleLinks.length} Connections
            </span>
          </div>
        </div>
      </div>

      {/* ── Unified Interactive Controls & Filters Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Selector */}
          {currentEmployee && (
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => setScope('my')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  scope === 'my'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                👤 My Network
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  scope === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🌐 Entire Enterprise
              </button>
            </div>
          )}

          {/* Entity Type Filter */}
          <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-3">
            {(['All', 'Person', 'Skill', 'Project'] as const).map(type => {
              const active = nodeTypeFilter === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNodeTypeFilter(type)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-violet-600 text-white font-bold shadow-xs'
                      : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {type === 'All' ? 'All Entities' : type === 'Person' ? 'Team Members' : `${type}s`}
                </button>
              );
            })}
          </div>

          {/* Category Filter Select */}
          {categories.length > 2 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 focus:border-violet-500 focus:outline-none cursor-pointer"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'All Domains / Categories' : cat}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search nodes, skills, projects..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 py-1.5 pl-8 pr-7 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-violet-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs p-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Graph Canvas & Inspector Grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Main SVG Visualization Canvas */}
        <section
          className="relative flex min-h-[620px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm lg:col-span-8 select-none"
          aria-label="Interactive skill graph canvas"
        >
          {/* Subtle Grid / Starfield Pattern */}
          <div
            className="absolute inset-0 opacity-40 dark:opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.3) 1px, transparent 1px)',
              backgroundSize: '28px 28px'
            }}
          />

          {/* Floating Canvas Controls */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-sm">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => zoomBy(-0.2)}
              className="rounded-lg p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-12 text-center text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => zoomBy(0.2)}
              className="rounded-lg p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
              title="Reset Zoom & Pan"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* SVG Canvas */}
          <svg
            className="h-[600px] w-full touch-none select-none cursor-grab active:cursor-grabbing"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            onPointerDown={event => {
              if (event.target === event.currentTarget) {
                setDrag({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
              }
            }}
            onPointerMove={event => {
              if (drag) {
                setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
              }
            }}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => {
              setDrag(null);
              setHoveredNodeId(null);
            }}
          >
            {/* SVG Defs for Rich Gradients and Glows */}
            <defs>
              {/* Radial Gradients for Nodes */}
              <radialGradient id="grad-person" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#818CF8" />
                <stop offset="100%" stopColor="#4F46E5" />
              </radialGradient>
              <radialGradient id="grad-skill" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="100%" stopColor="#059669" />
              </radialGradient>
              <radialGradient id="grad-project" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#FBBF24" />
                <stop offset="100%" stopColor="#D97706" />
              </radialGradient>

              {/* Glowing Halo Filter */}
              <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Soft Drop Shadow Filter */}
              <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Transform Container with Pan and Zoom */}
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {/* Links Layer */}
              {visibleLinks.map(link => {
                const source = positionedById.get(link.source);
                const target = positionedById.get(link.target);
                if (!source || !target) return null;

                const isSelectedLink = selectedNodeId ? (source.id === selectedNodeId || target.id === selectedNodeId) : false;
                const isHoveredLink = hoveredNodeId ? (source.id === hoveredNodeId || target.id === hoveredNodeId) : false;
                const isHighlighted = isSelectedLink || isHoveredLink;

                return (
                  <line
                    key={`${link.source}:${link.target}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={isHighlighted ? '#8B5CF6' : '#94A3B8'}
                    strokeWidth={isHighlighted ? 2.5 : 1.2}
                    strokeOpacity={
                      selectedNodeId
                        ? (isSelectedLink ? 0.95 : 0.12)
                        : (hoveredNodeId ? (isHoveredLink ? 0.9 : 0.2) : 0.35)
                    }
                    strokeDasharray={link.source.startsWith('proj-') && link.target.startsWith('skill-') ? '3 3' : undefined}
                    pointerEvents="none"
                    className="pointer-events-none transition-all duration-150"
                  />
                );
              })}

              {/* Nodes Layer */}
              {visibleNodes.map(node => {
                const selected = node.id === selectedNodeId;
                const hovered = node.id === hoveredNodeId;
                const connected = selectedConnectedNodeIds.has(node.id);
                const showLabel = selected || hovered || connected || zoom >= 1.35;
                const isEmpSkill = empSkillIds.has(node.id);
                const dim = selectedNodeId && !connected;

                const gradId =
                  node.type === 'Person'
                    ? 'url(#grad-person)'
                    : node.type === 'Skill'
                    ? 'url(#grad-skill)'
                    : 'url(#grad-project)';

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer transition-transform duration-150"
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={() => {
                      setSelectedNodeId(node.id);
                      handleCenterOnNode(node);
                    }}
                    opacity={dim ? 0.22 : 1}
                  >
                    {/* Invisible Hit Target to Eliminate Hover Jitter */}
                    <circle r={(node.val || 14) + 12} fill="transparent" />

                    {/* Employee Verified Skill Highlight Ring */}
                    {isEmpSkill && (
                      <circle
                        r={(node.val || 14) + 6}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2.5"
                        strokeDasharray="4 3"
                        pointerEvents="none"
                        className="animate-spin-slow"
                      />
                    )}

                    {/* Active / Hover Pulse Halo */}
                    {(selected || hovered) && (
                      <circle
                        r={(node.val || 14) + 7}
                        fill="none"
                        stroke={selected ? '#8B5CF6' : '#A78BFA'}
                        strokeWidth="3"
                        filter="url(#node-glow)"
                        pointerEvents="none"
                      />
                    )}

                    {/* Main Node Circle */}
                    <circle
                      r={node.val || 14}
                      fill={gradId}
                      stroke={selected ? '#FFFFFF' : hovered ? '#F3E8FF' : 'rgba(255,255,255,0.7)'}
                      strokeWidth={selected ? 3 : 1.5}
                      filter="url(#node-shadow)"
                      pointerEvents="none"
                    />

                    {/* Node Center Icon Glyphs */}
                    {node.type === 'Person' ? (
                      <circle r="4" fill="#FFFFFF" fillOpacity="0.85" pointerEvents="none" />
                    ) : node.type === 'Skill' ? (
                      <rect x="-3" y="-3" width="6" height="6" rx="1.5" fill="#FFFFFF" fillOpacity="0.85" pointerEvents="none" />
                    ) : (
                      <polygon points="0,-4 4,3 -4,3" fill="#FFFFFF" fillOpacity="0.9" pointerEvents="none" />
                    )}

                    {/* Node Text Label with Clean Halo */}
                    {showLabel && (
                      <g pointerEvents="none">
                        <text
                          y={(node.val || 14) + 16}
                          textAnchor="middle"
                          fontSize="11.5"
                          fontWeight={selected ? '700' : '600'}
                          className="select-none fill-slate-900 dark:fill-white"
                          style={{
                            paintOrder: 'stroke fill',
                            stroke: 'var(--bg-surface, #ffffff)',
                            strokeWidth: '4px',
                            strokeLinejoin: 'round'
                          }}
                        >
                          {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Clean Graph Legend Bar */}
          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2 text-2xs font-bold text-slate-700 dark:text-slate-300 shadow-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-xs" />
              Team Member
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs" />
              Skill Capability
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-xs" />
              Project Initiative
            </span>
            {currentEmployee && (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 border-l border-slate-200 dark:border-slate-800 pl-2.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-emerald-500" />
                Verified in Profile
              </span>
            )}
          </div>
        </section>

        {/* ── Node Details Inspector Panel ── */}
        <aside className="flex flex-col rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm lg:col-span-4 min-h-[600px]">
          {selectedNode ? (
            <div className="space-y-5">
              {/* Node Badge & Title */}
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-wider ${
                      selectedNode.type === 'Person'
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30'
                        : selectedNode.type === 'Skill'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                    }`}
                  >
                    {selectedNode.type === 'Person' && <User className="h-3 w-3" />}
                    {selectedNode.type === 'Skill' && <Sparkles className="h-3 w-3" />}
                    {selectedNode.type === 'Project' && <FolderGit2 className="h-3 w-3" />}
                    {selectedNode.type} Entity
                  </span>

                  <button
                    type="button"
                    onClick={() => handleCenterOnNode(selectedNode)}
                    className="text-2xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Compass className="h-3 w-3" /> Center View
                  </button>
                </div>

                <h3 className="mt-2.5 text-xl font-bold font-heading text-slate-900 dark:text-white">
                  {selectedNode.label}
                </h3>
                {selectedNode.category && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Category: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedNode.category}</span>
                  </p>
                )}
              </div>

              {/* Personal insight for logged-in employee */}
              {currentEmployee && selectedNode.type === 'Skill' && (
                empSkillIds.has(selectedNode.id) ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs space-y-2">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Verified in Your Technical Profile
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-2xs">
                      You hold validated technical evidence and peer verifications for this competency.
                    </p>
                    <button
                      type="button"
                      onClick={() => onInspectEvidence(currentEmployee, selectedNode.label)}
                      className="w-full rounded-xl bg-emerald-600 text-white font-bold py-2 text-xs hover:bg-emerald-700 transition-colors shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Inspect Your Evidence Proofs
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3.5 text-xs space-y-1.5">
                    <div className="font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-violet-500" />
                      Skill Growth Opportunity
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-2xs">
                      This capability links to your active technical network. Explore internal upskilling tracks to add it to your career profile.
                    </p>
                  </div>
                )
              )}

              {/* Connected Details: If Skill is Selected */}
              {selectedNode.type === 'Skill' && (
                <div className="space-y-4">
                  {/* Verified Team Members */}
                  <div>
                    <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Verified Team Members ({connectedEmployeesForSkill.length})
                    </h4>
                    {connectedEmployeesForSkill.length > 0 ? (
                      <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                        {connectedEmployeesForSkill.slice(0, 6).map(emp => {
                          const skillMatch = emp.skills.find(s => s.skillId === selectedNode.id);
                          return (
                            <div
                              key={emp.id}
                              className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-2 text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="font-semibold text-slate-900 dark:text-white truncate">
                                  {emp.display_label || emp.name}
                                </div>
                                <div className="text-2xs text-slate-500 dark:text-slate-400 truncate">
                                  {emp.role}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => onInspectEvidence(emp, selectedNode.label)}
                                className="shrink-0 rounded-lg px-2 py-1 text-2xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                              >
                                {skillMatch?.proficiencyLevel || 'Inspect'} →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-2xs text-slate-400 italic">No team members linked yet.</p>
                    )}
                  </div>

                  {/* Associated Projects */}
                  {connectedProjectsForSkill.length > 0 && (
                    <div>
                      <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Applied in Initiatives ({connectedProjectsForSkill.length})
                      </h4>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {connectedProjectsForSkill.map(p => (
                          <div
                            key={p.project_id}
                            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-2 text-xs"
                          >
                            <span className="font-semibold text-slate-900 dark:text-white block truncate">
                              {p.project_name}
                            </span>
                            <span className="text-2xs text-slate-500 dark:text-slate-400">
                              Domain: {p.domain || 'Engineering'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Connected Details: If Person is Selected */}
              {selectedEmployee && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3 text-xs space-y-1">
                    <div className="text-slate-500 dark:text-slate-400">
                      Department: <strong className="text-slate-900 dark:text-white">{selectedEmployee.department}</strong>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Team: <strong className="text-slate-900 dark:text-white">{selectedEmployee.team}</strong>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Availability: <strong className="text-emerald-600 dark:text-emerald-400">{selectedEmployee.availabilityPercent}% ({selectedEmployee.hoursPerWeekFree} hrs/wk free)</strong>
                    </div>
                  </div>

                  <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Verified Competencies ({selectedEmployee.skills.length})
                  </h4>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {selectedEmployee.skills.map(skill => (
                      <button
                        key={skill.skillId}
                        type="button"
                        onClick={() => onInspectEvidence(selectedEmployee, skill.skillName)}
                        className="flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className="font-semibold text-slate-900 dark:text-white truncate pr-2">
                          {skill.skillName}
                        </span>
                        <span className="shrink-0 text-2xs text-violet-600 dark:text-violet-400 font-bold">
                          {skill.proficiencyLevel} · Proofs →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Details: If Project is Selected */}
              {selectedProject && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3 text-xs space-y-1">
                    <div className="text-slate-500 dark:text-slate-400">
                      Domain: <strong className="text-slate-900 dark:text-white">{selectedProject.domain}</strong>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Complexity: <strong className="text-amber-600 dark:text-amber-400">{selectedProject.complexity} / 5</strong>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Status: <strong className="text-slate-900 dark:text-white">{selectedProject.status || 'Active'}</strong>
                    </div>
                  </div>

                  <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Required Technologies
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedProject.technologies || '').split('|').filter(Boolean).map(tech => (
                      <span
                        key={tech}
                        className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 text-2xs font-bold text-amber-700 dark:text-amber-300"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Entities Links List */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
                <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-400">
                  Direct Ontology Links ({Math.max(0, selectedConnectedNodeIds.size - 1)})
                </h4>
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {[...selectedConnectedNodeIds]
                    .filter(id => id !== selectedNode.id)
                    .map(id => {
                      const node = byId.get(id);
                      if (!node) return null;
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => {
                            setSelectedNodeId(node.id);
                            handleCenterOnNode(node);
                          }}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:border-violet-300"
                        >
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {node.label}
                          </span>
                          <span className="text-2xs text-slate-400 shrink-0 ml-2">
                            {node.type} →
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Trust & Evidence Info Footer */}
              <div className="pt-2 flex items-start gap-2 text-xs text-slate-400">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                <p className="leading-relaxed text-2xs">
                  Connections are dynamically formed via employee verified skill evidence, project staffing records, and required technology matrices.
                </p>
              </div>
            </div>
          ) : (
            <div className="my-auto py-12 text-center text-xs text-slate-400 space-y-2">
              <Compass className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p>Select any node in the graph to inspect verified skills, staffing, and entity connections.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
