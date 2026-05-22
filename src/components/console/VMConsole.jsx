import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Maximize2, 
  Terminal, 
  Zap, 
  RefreshCcw, 
  Keyboard, 
  MousePointer2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/useAuthStore';

export const VMConsole = ({ vm, onClose }) => {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // connecting, connected, error, disconnected
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const socketRef = useRef(null);
  const wmksRef = useRef(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const sendSpecialKey = (key) => {
    if (wmksRef.current) {
      if (key === 'ctrl-alt-del') wmksRef.current.sendCAD();
      else if (key === 'esc') wmksRef.current.sendKeyCodes([27]);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const connectConsole = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(`/api/vms/${vm.id}/ticket`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: JSON.stringify({})
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || '无法获取控制台票据');
        }
        const ticketData = await response.json();

        if (!isMounted) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const nexusToken = useAuthStore.getState().token;
        const params = new URLSearchParams({
          host: ticketData.host,
          port: ticketData.port,
          ticket: ticketData.ticket,
          token: nexusToken || ''
        });
        const proxyUrl = `${protocol}//${window.location.host}/api/console-proxy?${params.toString()}`;
        
        if (window.WMKS) {
          console.log('[WMKS] SDK Detected, initializing container...');
          // Give DOM a moment to settle
          setTimeout(() => {
            const wmks = window.WMKS.createWMKS('wmks-container', {
              useVNC: false,
              rescale: true,
              changeResolution: true
            });
            
            wmksRef.current = wmks;

            wmks.register(window.WMKS.CONST.Events.CONNECTION_STATE_CHANGE, (event, data) => {
              console.log('[WMKS] State Change:', data.state);
              if (data.state === window.WMKS.CONST.ConnectionState.CONNECTED) {
                setStatus('connected');
              } else if (data.state === window.WMKS.CONST.ConnectionState.DISCONNECTED) {
                setStatus('disconnected');
              }
            });

            wmks.register(window.WMKS.CONST.Events.ERROR, (event, data) => {
              console.error('[WMKS] Error:', data);
              setStatus('error');
              setError('WMKS 协议握手失败');
            });

            console.log('[WMKS] Connecting to proxy...');
            // Explicitly use the binary protocol which WMKS expects
            wmks.connect(proxyUrl, ['binary']);
          }, 200);
        } else {
          const socket = new WebSocket(proxyUrl);
          socketRef.current = socket;
          socket.binaryType = 'arraybuffer';
          socket.onopen = () => { if (isMounted) setStatus('connected'); };
          socket.onclose = (e) => {
             if (isMounted) {
               setStatus('disconnected');
               setError(e.reason || `连接已关闭 (代码: ${e.code})`);
             }
          };
          socket.onerror = () => { if (isMounted) setStatus('error'); };
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setError(err.message);
        }
      }
    };

    connectConsole();

    return () => {
      isMounted = false;
      if (wmksRef.current) {
        wmksRef.current.destroy();
        wmksRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [vm.id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      
      <div 
        ref={containerRef}
        className={cn(
          "relative bg-black border border-white/10 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden transition-all duration-300",
          isFullscreen ? "max-w-none h-full rounded-none" : "aspect-video h-auto"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-[#252525] border-b border-white/5 select-none z-10">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-lg">
                <Terminal size={14} className="text-primary" />
                <span className="text-xs font-black text-white">{vm.name}</span>
             </div>
             <div className="flex items-center gap-1">
                <button 
                  onClick={() => sendSpecialKey('ctrl-alt-del')}
                  className="px-2 py-1 hover:bg-white/10 rounded text-[10px] font-bold text-white/60 hover:text-white transition-colors"
                >
                  CTRL+ALT+DEL
                </button>
             </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4">
               <div className={cn(
                 "w-2 h-2 rounded-full",
                 status === 'connected' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : 
                 status === 'connecting' ? "bg-yellow-500 animate-pulse" : "bg-red-500"
               )} />
               <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  {status === 'connected' ? 'LIVE' : status === 'connecting' ? 'SYNCING' : 'OFFLINE'}
               </span>
            </div>
            <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"><Maximize2 size={18} /></button>
            <button onClick={onClose} className="p-2 hover:bg-red-500 rounded-lg text-white/60 hover:text-white"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden group">
           <div id="wmks-container" className="w-full h-full" />

           {status !== 'connected' && (
             <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-20">
                {status === 'connecting' ? (
                  <>
                    <RefreshCcw size={32} className="text-primary animate-spin mb-4" />
                    <p className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">Authenticating...</p>
                  </>
                ) : (
                  <div className="text-center space-y-4 max-w-sm px-6">
                    <AlertCircle size={32} className="text-red-500 mx-auto" />
                    <h4 className="text-lg font-bold text-white">{status === 'disconnected' ? '连接已断开' : '连接失败'}</h4>
                    <p className="text-xs text-white/40">{error || '无法与后端代理建立握手'}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all">重新尝试</button>
                  </div>
                )}
             </div>
           )}

           {status === 'connected' && !window.WMKS && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-black/80 z-20">
                <div className="p-6 bg-white/5 rounded-full border border-white/10 mb-6">
                   <Zap size={48} className="text-primary animate-pulse" />
                </div>
                <h3 className="text-xl font-black text-white tracking-tight">隧道已接通</h3>
                <p className="text-sm text-white/40 mt-2 max-w-xs">底层代理已就绪，请将 wmks.min.js 放入项目以启用真实画面。</p>
             </div>
           )}

           <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Connection Info</p>
                 <div className="flex gap-2 text-[10px] font-mono text-white/40">
                    <span className="px-2 py-0.5 bg-black/40 rounded border border-white/5">Proxy: :4173</span>
                    <span className="px-2 py-0.5 bg-black/40 rounded border border-white/5">MTU: 1500</span>
                 </div>
              </div>
              <div className="text-right">
                 <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">vSphere Nexus Embedded Engine v1.0</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
