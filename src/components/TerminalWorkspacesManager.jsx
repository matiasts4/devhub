import { useState, useRef, useEffect } from "react";
import { Plus, X, LayoutGrid, SplitSquareHorizontal, TerminalSquare } from "lucide-react";
import TerminalTTY from "./TerminalTTY";

export default function TerminalWorkspacesManager({ cwd, isVisible }) {
  const [workspaces, setWorkspaces] = useState([
    { id: 'ws1', name: 'Workspace 1', panels: [{ id: 'p1' }] }
  ]);
  const [activeWsId, setActiveWsId] = useState('ws1');
  
  const wsCounterRef = useRef(1);
  const panelCounterRef = useRef(1);

  const activeWorkspace = workspaces.find(w => w.id === activeWsId) || workspaces[0];

  const addWorkspace = () => {
    wsCounterRef.current += 1;
    panelCounterRef.current += 1;
    const newId = `ws${wsCounterRef.current}`;
    setWorkspaces([
      ...workspaces, 
      { id: newId, name: `Workspace ${wsCounterRef.current}`, panels: [{ id: `p${panelCounterRef.current}` }] }
    ]);
    setActiveWsId(newId);
  };

  const removeWorkspace = (e, idToRemove) => {
    e.stopPropagation();
    const newWs = workspaces.filter(w => w.id !== idToRemove);
    if (newWs.length === 0) return;
    setWorkspaces(newWs);
    if (activeWsId === idToRemove) {
      setActiveWsId(newWs[newWs.length - 1].id);
    }
  };

  const addPanelToWorkspace = (workspaceId) => {
    panelCounterRef.current += 1;
    setWorkspaces(workspaces.map(ws => {
      if (ws.id === workspaceId) {
        if (ws.panels.length >= 4) return ws; 
        return { ...ws, panels: [...ws.panels, { id: `p${panelCounterRef.current}` }] };
      }
      return ws;
    }));
  };

  const removePanelFromWorkspace = (workspaceId, panelId) => {
    setWorkspaces(workspaces.map(ws => {
      if (ws.id === workspaceId) {
        const newPanels = ws.panels.filter(p => p.id !== panelId);
        if (newPanels.length === 0) return ws;
        return { ...ws, panels: newPanels };
      }
      return ws;
    }));
  };

  const renderGrid = (panels, wsId) => {
    // Dynamic CSS Grid computation for multiplexing
    let gridClass = "grid h-full w-full gap-[6px] p-[6px] bg-[#0d0d0d]";
    if (panels.length === 1) gridClass += " grid-cols-1 grid-rows-1";
    if (panels.length === 2) gridClass += " grid-cols-2 grid-rows-1";
    if (panels.length === 3) gridClass += " grid-cols-2 grid-rows-2"; 
    // For 3, CSS Grid will put 1st in top-left, 2nd in top-right, 3rd in bottom-left.
    // If we want 1st to take double-height, we use col-span/row-span below
    if (panels.length === 4) gridClass += " grid-cols-2 grid-rows-2";

    return (
      <div className={gridClass}>
        {panels.map((p, index) => {
          let spanClass = "";
          // If 3 panels, make the first one span 2 rows natively on the left
          if (panels.length === 3 && index === 0) spanClass = "row-span-2";
          
          return (
             <div key={p.id} className={`relative rounded-md overflow-hidden ring-1 ring-[#333] shadow-lg flex flex-col bg-[#111] transition-all ${spanClass}`}>
                {/* Panel Tool Bar */}
                <div className="h-[28px] bg-[#1a1a1a] flex items-center justify-between px-3 shrink-0 border-b border-[#2a2a2a] group">
                   <div className="flex items-center gap-2 opacity-60">
                     <TerminalSquare className="w-3.5 h-3.5"/>
                     <span className="text-[11px] font-mono tracking-wide uppercase text-gray-300">Terminal {index + 1}</span>
                   </div>
                   {panels.length > 1 && (
                     <button 
                       onClick={() => removePanelFromWorkspace(wsId, p.id)}
                       className="w-5 h-5 opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-500/10 rounded transition-all text-gray-500 hover:text-red-400"
                     >
                       <X className="w-3.5 h-3.5" />
                     </button>
                   )}
                </div>

                {/* Sub Panel Content: The Terminal Component itself */}
                <div className="flex-1 relative">
                   <TerminalTTY cwd={cwd} hideTitleBar={true} autoFocus={index === panels.length - 1} />
                </div>
             </div>
          )
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0d0d] overflow-hidden">
      {/* Top Workspace Tab Bar */}
      <div className="flex items-end h-[46px] bg-[#1a1a1a] select-none shrink-0 border-b border-[#2a2a2a] px-3 pt-2">
        <div className="flex-1 flex gap-1 h-full items-end overflow-x-auto no-scrollbar">
          {workspaces.map(ws => (
            <div 
              key={ws.id}
              onClick={() => setActiveWsId(ws.id)}
              className={`group flex items-center justify-between h-[36px] px-4 rounded-t-xl transition-colors cursor-pointer min-w-[180px] max-w-[240px] border-x border-t ${
                activeWsId === ws.id 
                  ? 'bg-[#0d0d0d] text-gray-200 border-[#2a2a2a]' 
                  : 'bg-transparent text-gray-500 border-transparent hover:bg-[#222]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutGrid className={`w-3.5 h-3.5 ${activeWsId === ws.id ? 'text-[#58A6FF]' : 'opacity-70'}`} />
                <span className="text-xs font-semibold tracking-tight truncate">{ws.name}</span>
                <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded-full ml-1 font-mono">{ws.panels.length}</span>
              </div>
              {workspaces.length > 1 && (
                <button 
                  onClick={(e) => removeWorkspace(e, ws.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded ml-2"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={addWorkspace}
            className="w-8 h-[36px] flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-t-xl ml-1"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center h-[36px] px-2 gap-2 pb-1 shrink-0">
           <button 
             onClick={() => addPanelToWorkspace(activeWsId)}
             disabled={activeWorkspace.panels.length >= 4}
             className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-accent-primary hover:bg-accent-primary/10 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-accent-primary/20"
           >
             <SplitSquareHorizontal className="w-3.5 h-3.5" />
             <span>Dividir Panel</span>
           </button>
        </div>
      </div>

      {/* Persistent Grid Area */}
      <div className="flex-1 relative bg-[#0a0a0a]">
         {workspaces.map(ws => (
            <div 
              key={ws.id} 
              className="absolute inset-0"
              style={{
                 visibility: activeWsId === ws.id && isVisible ? 'visible' : 'hidden',
                 zIndex: activeWsId === ws.id ? 10 : 0
              }}
            >
               {renderGrid(ws.panels, ws.id)}
            </div>
         ))}
      </div>
    </div>
  );
}
