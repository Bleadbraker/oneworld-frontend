'use client';
import { useEffect, useState, Suspense, useRef } from 'react';
import { io } from 'socket.io-client';
import { useParams, useSearchParams } from 'next/navigation';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
const socket = io(backendUrl, { autoConnect: false });

function TrackerContent() {
  const params = useParams(); 
  const searchParams = useSearchParams();
  const migrationId = params?.id; 
  const isAdmin = searchParams.get('mode') === 'admin';
  
  const [state, setState] = useState(null);
  const [isExporting, setIsExporting] = useState(false); 
  const reportRef = useRef(null);

  useEffect(() => {
    if (!migrationId) return;
    socket.connect();
    socket.on('journey-updated', setState);
    socket.emit('request-journey-state', migrationId);
    return () => { socket.off('journey-updated'); socket.disconnect(); };
  }, [migrationId]);

  if (!state) return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-[#8BBB43] tracking-widest text-sm animate-pulse font-mono">
      <div className="w-12 h-12 mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>
        </svg>
      </div>
      <p>ESTABLISHING SECURE UPLINK TO DATABASE...</p>
    </div>
  );

  const displayAsAdmin = isAdmin && !isExporting;
  const isComplete = state.currentStageIndex === state.stages.length - 1;

  let currentStartHour = 0;
  const stagesWithStartTimes = state.stages.map(stage => {
    const s = { ...stage, startHour: currentStartHour };
    currentStartHour += stage.hours;
    return s;
  });

  const totalHours = Math.max(state.totalAllocatedHours, 1); 

  // --- MANUAL ADMIN CONTROLS ---
  const updateMeta = (field, value) => socket.emit('admin-update-meta', { id: migrationId, field, value });
  const updateCrew = (role, value) => socket.emit('admin-update-crew', { id: migrationId, role, value: value === '' ? 0 : value });
  const updateStageHours = (stageIndex, newHours) => socket.emit('admin-update-stage-hours', { id: migrationId, stageIndex, newHours: newHours === '' ? 0 : newHours });
  const updateProgress = (progress) => socket.emit('admin-update-progress', { id: migrationId, progress });
  const handleNextStage = () => socket.emit('admin-next-stage', migrationId);
  const handleReset = () => { if(window.confirm("Wipe all database records?")) socket.emit('admin-reset-journey', migrationId); };
  const copyClientLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/track/${migrationId}`);
    alert("View-Only Client Link Copied!");
  };

  // --- BULLETPROOF PDF GENERATOR ---
  const generatePDF = () => {
    setIsExporting(true); // Hides admin UI instantly

    setTimeout(async () => {
      const element = reportRef.current;
      if (element) {
        try {
          // Dynamic imports prevent Next.js SSR crashes
          const html2canvas = (await import('html2canvas')).default;
          const jsPDF = (await import('jspdf')).default;

          const canvas = await html2canvas(element, { backgroundColor: '#050505', scale: 2 });
          const data = canvas.toDataURL('image/png');
          
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
          pdf.addImage(data, 'PNG', 0, 0, canvas.width, canvas.height);
          pdf.save(`${state.operationId}_Migration_Report.pdf`);
        } catch (error) {
          console.error("PDF generation error:", error);
          alert("Error generating PDF. Please ensure html2canvas and jspdf are installed.");
        }
      }
      setIsExporting(false); // Restores admin UI
    }, 500); 
  };

  return (
    <div ref={reportRef} className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#8BBB43] selection:text-black flex flex-col">
      
      {/* HEADER BAR */}
      <div className="w-full bg-[#0a0a0a] border-b border-[#333] p-4 flex justify-between items-center z-50 shadow-md">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black tracking-[0.2em] text-[#8BBB43] uppercase">One World</h1>
          <div className="h-6 w-px bg-[#333]"></div>
          <div>
             {displayAsAdmin ? (
               <input type="text" value={state.clientName} onChange={(e) => updateMeta('clientName', e.target.value)} className="bg-transparent border-b border-[#444] text-sm text-white font-bold tracking-widest uppercase w-64 focus:outline-none focus:border-[#8BBB43] pb-1" />
             ) : (
               <p className="text-sm text-white font-bold tracking-widest uppercase">{state.clientName}</p>
             )}
             <div className="flex items-center gap-1 mt-1">
               <span className="text-[10px] font-mono tracking-wider text-gray-500">OP-ID:</span>
               {displayAsAdmin ? (
                 <input type="text" value={state.operationId} onChange={(e) => updateMeta('operationId', e.target.value)} className="bg-transparent border-b border-[#444] text-[10px] font-mono tracking-wider text-white w-32 focus:outline-none focus:border-[#8BBB43] uppercase" />
               ) : (
                 <span className="text-[10px] font-mono tracking-wider text-white uppercase">{state.operationId}</span>
               )}
             </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex gap-6 text-right">
             <div>
               <p className="text-[10px] text-gray-500 tracking-widest uppercase mb-1">Total Target</p>
               {displayAsAdmin ? (
                 <div className="flex items-center">
                   <input type="number" value={state.totalAllocatedHours} onChange={(e) => updateMeta('totalAllocatedHours', Number(e.target.value))} className="bg-transparent w-16 text-right text-lg font-mono font-bold text-white border-b border-[#444] focus:outline-none focus:border-[#8BBB43]" />
                   <span className="text-lg font-mono font-bold text-white ml-1">HRS</span>
                 </div>
               ) : (
                 <p className="text-lg font-mono font-bold text-white">{state.totalAllocatedHours} HRS</p>
               )}
             </div>
             <div>
               <p className="text-[10px] text-gray-500 tracking-widest uppercase mb-1">Elapsed</p>
               {displayAsAdmin ? (
                 <div className="flex items-center">
                   <input type="number" value={state.totalHoursElapsed} onChange={(e) => updateMeta('totalHoursElapsed', Number(e.target.value))} className="bg-transparent w-16 text-right text-lg font-mono font-bold text-white border-b border-[#444] focus:outline-none focus:border-[#8BBB43]" />
                   <span className="text-lg font-mono font-bold text-[#8BBB43] ml-1">HRS</span>
                 </div>
               ) : (
                 <p className="text-lg font-mono font-bold text-[#8BBB43]">{state.totalHoursElapsed} HRS</p>
               )}
             </div>
          </div>
          {displayAsAdmin && (
            <div className="flex gap-2">
              <button onClick={copyClientLink} className="bg-[#111] border border-[#444] text-gray-300 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-colors">🔗 Copy Link</button>
              <span className="bg-[#8BBB43] text-black px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest">Admin Mode</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-grow overflow-hidden">
        
        {/* LEFT PANEL: EXCEL GANTT CHART */}
        <div className="w-full lg:w-3/4 flex flex-col border-r border-[#222] bg-[#0a0a0a] overflow-x-auto custom-scrollbar">
          <div className="flex bg-[#111] border-b border-[#333] min-w-[800px] sticky top-0 z-20">
             <div className="w-[30%] p-3 border-r border-[#333] shrink-0">
                <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Scope / Task</p>
             </div>
             <div className="w-[70%] p-3 relative flex items-center">
                <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase absolute left-4">0 Hrs</p>
                <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase absolute right-4">Timeline ➔ {state.totalAllocatedHours} Hrs</p>
             </div>
          </div>

          <div className="flex flex-col min-w-[800px] pb-10">
            {stagesWithStartTimes.map((stage, i) => {
              const isPast = i < state.currentStageIndex;
              const isActive = i === state.currentStageIndex;
              const widthPercent = (stage.hours / totalHours) * 100;
              const marginLeftPercent = (stage.startHour / totalHours) * 100;

              return (
                <div key={stage.id} className={`flex border-b border-[#222] transition-colors ${isActive ? 'bg-[#1a1a1a]' : 'hover:bg-[#111]'}`}>
                   <div className="w-[30%] p-3 border-r border-[#222] shrink-0 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                         <span className={`text-[10px] ${isActive ? 'text-[#8BBB43] animate-pulse' : isPast ? 'text-gray-600' : 'text-gray-500'}`}>
                           {isPast ? '✓' : isActive ? '▶' : '○'}
                         </span>
                         <span className={`text-xs font-bold tracking-wider uppercase ${isActive ? 'text-white' : isPast ? 'text-gray-500' : 'text-gray-400'}`}>
                           {stage.label}
                         </span>
                      </div>
                      {displayAsAdmin ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={stage.hours} onChange={(e) => updateStageHours(i, e.target.value)} className="w-10 bg-[#050505] border border-[#444] text-center text-[10px] font-mono text-white rounded py-1 focus:outline-none focus:border-[#8BBB43]" />
                          <span className="text-[9px] text-gray-600 font-mono">H</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-500 font-mono">{stage.hours}H</span>
                      )}
                   </div>

                   <div className="w-[70%] relative py-2 px-2 flex items-center">
                      <div className="absolute inset-0 flex justify-between pointer-events-none px-2">
                        {[...Array(10)].map((_, idx) => <div key={idx} className="h-full w-px bg-[#222]"></div>)}
                      </div>
                      {stage.hours > 0 && (
                        <div 
                          className={`h-6 rounded-[2px] z-10 flex items-center px-2 text-[9px] font-bold tracking-widest overflow-hidden shadow-sm transition-all duration-300
                            ${isPast ? 'bg-[#222] text-gray-500 border border-[#333]' : isActive ? 'bg-[#8BBB43] text-black shadow-[0_0_10px_rgba(139,187,67,0.3)]' : 'bg-[#111] text-gray-500 border border-[#333]'}`}
                          style={{ marginLeft: `${marginLeftPercent}%`, width: `${widthPercent}%`, minWidth: '40px' }}
                        >
                          {stage.hours} Hrs
                        </div>
                      )}
                   </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL: CREW & COMMAND OVERRIDE */}
        <div className="w-full lg:w-1/4 bg-[#050505] flex flex-col overflow-y-auto">
          
          <div className="p-6 border-b border-[#222] bg-[#0a0a0a]">
             <p className="text-[10px] text-[#8BBB43] font-bold tracking-[0.2em] uppercase mb-2">Live Operation</p>
             <h2 className="text-lg font-bold tracking-widest uppercase text-white mb-4 leading-tight">{state.stages[state.currentStageIndex]?.label}</h2>
             <div className="w-full bg-[#222] h-2 rounded-full overflow-hidden mb-2">
                <div className="bg-[#8BBB43] h-full transition-all duration-300" style={{ width: `${state.stageProgress}%` }}></div>
             </div>
             <div className="flex justify-between text-[10px] font-mono text-gray-400">
                <span>Phase Progress</span>
                <span className="text-[#8BBB43]">{state.stageProgress}%</span>
             </div>
          </div>

          <div className="p-6 border-b border-[#222]">
             <h3 className="text-[#8BBB43] text-[10px] font-bold tracking-[0.2em] uppercase mb-4">Crew Manifest</h3>
             <div className="space-y-4">
               <div>
                  <p className="text-[9px] text-gray-600 font-bold tracking-widest uppercase mb-2">Technical Team</p>
                  <div className="flex justify-between items-center text-xs font-mono mb-2">
                    <span className="text-gray-400 uppercase text-[10px]">Network Eng.</span>
                    {displayAsAdmin ? <input type="number" value={state.crew.networkEng} onChange={(e) => updateCrew('networkEng', e.target.value)} className="w-10 bg-[#111] border border-[#333] text-center text-white rounded text-[10px] py-1 focus:outline-none focus:border-[#8BBB43]" /> : <span className="text-white">{state.crew.networkEng}</span>}
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-gray-400 uppercase text-[10px]">Server Eng.</span>
                    {displayAsAdmin ? <input type="number" value={state.crew.serverEng} onChange={(e) => updateCrew('serverEng', e.target.value)} className="w-10 bg-[#111] border border-[#333] text-center text-white rounded text-[10px] py-1 focus:outline-none focus:border-[#8BBB43]" /> : <span className="text-white">{state.crew.serverEng}</span>}
                  </div>
               </div>
               <div>
                  <p className="text-[9px] text-gray-600 font-bold tracking-widest uppercase mb-2">Logistics Team</p>
                  <div className="flex justify-between items-center text-xs font-mono mb-2">
                    <span className="text-gray-400 uppercase text-[10px]">Proj Mgr / Spvr</span>
                    {displayAsAdmin ? <input type="number" value={state.crew.managers} onChange={(e) => updateCrew('managers', e.target.value)} className="w-10 bg-[#111] border border-[#333] text-center text-white rounded text-[10px] py-1 focus:outline-none focus:border-[#8BBB43]" /> : <span className="text-white">{state.crew.managers}</span>}
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono mb-2">
                    <span className="text-gray-400 uppercase text-[10px]">Packing / Labor</span>
                    {displayAsAdmin ? <input type="number" value={state.crew.labor} onChange={(e) => updateCrew('labor', e.target.value)} className="w-10 bg-[#111] border border-[#333] text-center text-white rounded text-[10px] py-1 focus:outline-none focus:border-[#8BBB43]" /> : <span className="text-white">{state.crew.labor}</span>}
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-gray-400 uppercase text-[10px]">Truck Drivers</span>
                    {displayAsAdmin ? <input type="number" value={state.crew.drivers} onChange={(e) => updateCrew('drivers', e.target.value)} className="w-10 bg-[#111] border border-[#333] text-center text-white rounded text-[10px] py-1 focus:outline-none focus:border-[#8BBB43]" /> : <span className="text-white">{state.crew.drivers}</span>}
                  </div>
               </div>
             </div>
          </div>

          {displayAsAdmin && (
            <div className="p-6 bg-[#0a0a0a] flex-grow flex flex-col">
               <h3 className="text-[#8BBB43] text-[10px] font-bold tracking-[0.2em] uppercase mb-4">Command Override</h3>
               
               <div className="mb-6">
                  <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">
                     <span>Manual Stage Push</span>
                  </div>
                  <input type="range" min="0" max="100" value={state.stageProgress} onChange={(e) => updateProgress(e.target.value)} className="w-full accent-[#8BBB43] h-2 bg-[#222] rounded-lg appearance-none cursor-pointer mb-2" />
               </div>

               <div className="flex flex-col gap-3 mt-auto">
                 {isComplete ? (
                    <button onClick={generatePDF} className="w-full bg-white text-black py-3 rounded-[4px] text-[10px] tracking-widest uppercase font-bold hover:bg-gray-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)] border-2 border-white">
                      🖨️ Export PDF Report
                    </button>
                 ) : (
                   <button onClick={handleNextStage} className="w-full bg-[#8BBB43] text-black py-3 rounded-[4px] text-[10px] tracking-widest uppercase font-bold hover:bg-white transition-all shadow-lg">
                     Execute Next Phase ➔
                   </button>
                 )}
                 <button onClick={handleReset} className="w-full border border-[#444] text-gray-500 hover:text-red-500 hover:border-red-900 px-4 py-2 rounded-[4px] text-[10px] tracking-widest uppercase font-bold transition-all mt-2">
                   Reset Database
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientTracker() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505]"></div>}>
      <TrackerContent />
    </Suspense>
  );
}