import { useState, useRef, useEffect } from "react";
import { Plus, X, ChevronDown, TerminalSquare } from "lucide-react";
import TerminalTTY from "./TerminalTTY";

export default function TerminalTabsManager({ onClose, cwd }) {
  const [tabs, setTabs] = useState([{ id: '1', name: 'matias@kali: ~' }]);
  const [activeTabId, setActiveTabId] = useState('1');
  const counterRef = useRef(1);

  const addTab = () => {
    counterRef.current += 1;
    const newId = String(counterRef.current);
    setTabs([...tabs, { id: newId, name: `matias@kali: ~` }]);
    setActiveTabId(newId);
  };

  const removeTab = (e, idToRemove) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== idToRemove);
    if (newTabs.length === 0) {
      onClose();
      // Optionally reset logic next time it opens
      return;
    }
    setTabs(newTabs);
    if (activeTabId === idToRemove) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0d0d] overflow-hidden">
      {/* Kali Linux Style Tab Bar */}
      <div className="flex items-end h-[38px] bg-[#1a1a1a] select-none shrink-0 border-b border-[#2a2a2a]">
        
        <div className="flex-1 overflow-x-auto flex items-end h-full px-2 gap-1 no-scrollbar pt-2">
          {tabs.map((tab) => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center justify-between h-[30px] px-3 mt-auto rounded-t-lg text-[13px] border border-[#2a2a2a] border-b-0 cursor-pointer min-w-[140px] max-w-[200px] transition-colors ${
                activeTabId === tab.id 
                  ? 'bg-[#0d0d0d] text-gray-200' 
                  : 'bg-[#1a1a1a] text-gray-500 hover:bg-[#222222]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <TerminalSquare className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
                <span className="truncate font-mono text-[11px] tracking-tight">{tab.name}</span>
              </div>
              <button 
                onClick={(e) => removeTab(e, tab.id)}
                className={`w-4 h-4 rounded-sm flex items-center justify-center transition-colors ${
                  activeTabId === tab.id ? 'opacity-100 hover:bg-white/10' : 'opacity-0 group-hover:opacity-100 hover:bg-white/10'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          
          <button 
            onClick={addTab}
            className="w-7 h-[30px] flex items-center justify-center hover:bg-white/5 rounded-t-lg text-gray-500 hover:text-gray-300 mt-auto ml-1 transition-colors"
            title="Nueva pestaña"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Global Panel Controls */}
        <div className="flex items-center px-4 gap-2 shrink-0 h-[30px] mt-auto">
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors" title="Cerrar panel inferior">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Bodies Area (Absolute overlap so all remain mounted) */}
      <div className="flex-1 relative bg-[#0d0d0d]">
        {tabs.map(tab => (
          <div 
            key={tab.id} 
            className="absolute inset-0"
            style={{ 
              zIndex: activeTabId === tab.id ? 10 : 0, 
              visibility: activeTabId === tab.id ? 'visible' : 'hidden',
              opacity: activeTabId === tab.id ? 1 : 0,
            }}
          >
            <TerminalTTY cwd={cwd} autoFocus={activeTabId === tab.id} hideTitleBar={true} />
          </div>
        ))}
      </div>
    </div>
  );
}
