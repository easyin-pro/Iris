import React, { useState, useRef, useEffect } from 'react';
import { Camera, Send, X, Upload, Mic, ChevronDown, FileText, LayoutGrid, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';
import { IRIS_SYSTEM_INSTRUCTION } from './irisConfig';

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Message = {
  role: 'user' | 'model';
  content: string;
  image?: string; 
};

// Custom simplified gradient logo for the modern theme
const IrisLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="irisModern" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f43f5e" />
        <stop offset="50%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
    <path fill="url(#irisModern)" d="M50 15 C 20 15 15 50 15 50 C 15 50 20 85 50 85 C 80 85 85 50 85 50 C 85 50 80 15 50 15 Z M50 70 C 39 70 30 61 30 50 C 30 39 39 30 50 30 C 61 30 70 39 70 50 C 70 61 61 70 50 70 Z M50 40 C 44.5 40 40 44.5 40 50 C 40 55.5 44.5 60 50 60 C 55.5 60 60 55.5 60 50 C 60 44.5 55.5 40 50 40 Z" />
  </svg>
);

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // File Upload State
  const [attachedFiles, setAttachedFiles] = useState<{name: string, type: string, base64: string}[]>([]);

  const startNewChat = () => {
    setMessages([]);
    setAttachedFiles([]);
    setInput('');
  };

  const toggleCamera = async () => {
    if (cameraActive && stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
      setCameraActive(false);
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setStream(newStream);
        setCameraActive(true);
      } catch (err) {
        console.error('Camera error', err);
        alert('Could not access camera.');
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64Str = ev.target?.result as string; 
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          type: file.type,
          base64: base64Str
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const captureCameraFrame = (): string | null => {
    if (!cameraActive || !videoRef.current || !canvasRef.current) return null;
    const cw = videoRef.current.videoWidth;
    const ch = videoRef.current.videoHeight;
    canvasRef.current.width = cw;
    canvasRef.current.height = ch;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, cw, ch);
    return canvasRef.current.toDataURL('image/jpeg', 0.8);
  };

  const sendMessage = async (presetText?: string) => {
    const textToSend = presetText || input;
    if (!textToSend.trim() && attachedFiles.length === 0 && !cameraActive) return;
    
    setIsProcessing(true);
    setInput('');
    
    const frameBase64 = captureCameraFrame();
    
    setMessages(prev => [...prev, {
      role: 'user',
      content: textToSend || (frameBase64 ? 'Attached camera frame for analysis.' : 'Parsed files.'),
      image: frameBase64 || undefined
    }]);

    try {
      const parts: any[] = [];
      
      if (frameBase64) {
        const pureBase64 = frameBase64.split(',')[1];
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: pureBase64
          }
        });
      }

      attachedFiles.forEach(file => {
        const pureBase64 = file.base64.split(',')[1];
        parts.push({
          inlineData: {
            mimeType: file.type || 'application/octet-stream',
            data: pureBase64
          }
        });
      });

      if (textToSend) {
        parts.push({ text: textToSend });
      }

      const formattedHistory = messages.slice(-10).map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
      
      if (formattedHistory) {
         parts.unshift({ text: `Prior Conversation History:\n${formattedHistory}\n\n[USER NEW INPUT BELOW]\n` });
      }

      setAttachedFiles([]);
      if (cameraActive) toggleCamera();

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          systemInstruction: IRIS_SYSTEM_INSTRUCTION,
        }
      });

      setMessages(prev => [...prev, { role: 'model', content: response.text || '' }]);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', content: "I'm sorry, I'm having trouble connecting right now." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [stream]);

  // Bind the camera stream whenever it changes or when the view toggles
  const hasStartedChat = messages.length > 0;
  
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, hasStartedChat, cameraActive]);

  return (
    <div className="w-full h-screen text-white overflow-hidden flex flex-col font-sans transition-all">
      <div className="bg-wallpaper w-full h-full overflow-hidden flex flex-col relative">
        
        {/* Top Header */}
        <header className="flex justify-between items-center p-6 z-10 shrink-0">
          <div className="flex items-center gap-3">
             <IrisLogo className="w-8 h-8" />
             <h1 className="font-semibold text-lg tracking-wide text-white">IRIS</h1>
          </div>
          <div className="flex gap-4">
             {hasStartedChat && (
                <button 
                  onClick={startNewChat}
                  className="px-4 py-2 text-sm text-white/90 hover:text-white glass-pill rounded-full transition-colors font-medium border border-white/20 hover:border-white/40"
                >
                  New Chat
                </button>
             )}
          </div>
        </header>

        {/* Dynamic Main Content Area */}
        <div className="flex-grow flex flex-col overflow-hidden relative z-10">
          
          {!hasStartedChat ? (
            /* START SCREEN GREETING */
            <div className="flex-grow flex flex-col items-center justify-center pt-[8vh] px-4 animate-in fade-in duration-500 mb-[10vh]">
               <h3 className="text-4xl text-white font-semibold tracking-tight mb-8 drop-shadow-lg text-center">What can I help you with today?</h3>
               
               {/* Main Center Input Bar */}
               <div className="w-full max-w-3xl panel rounded-[28px] p-3 flex flex-col shadow-2xl relative">
                 {attachedFiles.length > 0 && (
                   <div className="flex flex-wrap gap-2 mb-3 px-3">
                     {attachedFiles.map((file, i) => (
                       <div key={i} className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-lg text-xs font-medium">
                         <span className="truncate max-w-[120px]">{file.name}</span>
                         <button onClick={() => setAttachedFiles(f => f.filter((_, idx) => idx !== i))} className="text-white/60 hover:text-red-400"><X className="w-3 h-3"/></button>
                       </div>
                     ))}
                   </div>
                 )}
                 <textarea 
                   value={input}
                   onChange={e => setInput(e.target.value)}
                   onKeyDown={e => {
                     if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       sendMessage();
                     }
                   }}
                   placeholder="Ask anything" 
                   className="w-full bg-transparent text-white placeholder-white/50 focus:outline-none resize-none px-4 pt-1 pb-4 text-lg pr-12"
                   rows={1}
                 />
                 
                 {cameraActive && (
                   <div className="mx-4 mb-4 mt-2 overflow-hidden rounded-xl border border-white/10 aspect-video relative max-w-[200px] shadow-lg">
                     <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                   </div>
                 )}

                 <div className="flex justify-between items-center px-2">
                    <button className="flex items-center gap-2 text-sm text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors font-medium">
                       <IrisLogo className="w-4 h-4" />
                       Smart (IRIS) <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                    <div className="flex items-center gap-1">
                       <label className="p-2.5 hover:bg-white/10 rounded-full cursor-pointer transition-colors text-white/80 hover:text-white">
                          <Upload className="w-5 h-5"/>
                          <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                       </label>
                       <button onClick={toggleCamera} className={`p-2.5 rounded-full transition-colors ${cameraActive ? 'bg-blue-500 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>
                          <Camera className="w-5 h-5"/>
                       </button>
                       <button 
                         disabled={isProcessing || (!input && attachedFiles.length===0 && !cameraActive)}
                         onClick={() => sendMessage()}
                         className={`p-2.5 ml-1 rounded-full transition-colors ${input.trim() || attachedFiles.length || cameraActive ? 'bg-white text-black hover:bg-white/90' : 'text-white/40 bg-white/5 cursor-not-allowed'}`}
                       >
                          <Send className="w-5 h-5"/>
                       </button>
                    </div>
                 </div>
               </div>

               {/* Suggestions */}
               <div className="flex justify-center flex-wrap gap-2.5 mt-6">
                 {['Write a first draft', 'Get advice', 'Learn something new', 'Make a plan'].map(label => (
                   <button key={label} onClick={() => sendMessage(label)} className="bg-black/30 hover:bg-white/10 border border-white/10 backdrop-blur-md px-4 py-2 rounded-full text-sm text-white/90 hover:text-white transition-colors duration-200">
                     {label}
                   </button>
                 ))}
               </div>

            </div>
          ) : (
            /* ACTIVE CHAT VIEW */
            <div className="flex-grow flex flex-col justify-between max-w-4xl mx-auto w-full h-full">
              
              {/* Messages Area */}
              <div className="flex-grow overflow-y-auto px-4 py-6 space-y-6">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`w-full flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {msg.role !== 'user' && (
                        <div className="flex items-center gap-2 mb-2 ml-1">
                          <IrisLogo className="w-5 h-5"/>
                          <span className="text-xs font-medium text-white/80">IRIS</span>
                        </div>
                      )}
                      
                      <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-[#2b3548]/90 text-white shadow-md' : 'bg-transparent text-white/90'}`}>
                        {msg.image && (
                          <img src={msg.image} alt="Vision context" className="max-w-[300px] rounded-xl mb-3 shadow-lg border border-white/10" />
                        )}
                        <div className="text-[15px] leading-relaxed prose-p:my-2 prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:p-4 prose-pre:rounded-xl prose-a:text-blue-400 break-words">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {isProcessing && (
                  <div className="w-full flex justify-start">
                    <div className="max-w-[85%] flex flex-col items-start">
                      <div className="flex items-center gap-2 mb-2 ml-1">
                        <IrisLogo className="w-5 h-5 opacity-70 animate-pulse"/>
                        <span className="text-xs font-medium text-white/60">IRIS is typing...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar Pinned to Target Bottom */}
              <div className="p-4 bg-transparent shrink-0">
                <div className="w-full panel bg-[#161b26]/95 border border-white/10 rounded-[28px] p-2 flex flex-col shadow-2xl">
                   {attachedFiles.length > 0 && (
                     <div className="flex flex-wrap gap-2 mb-2 px-3 pt-2">
                       {attachedFiles.map((file, i) => (
                         <div key={i} className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-lg text-xs font-medium">
                           <span className="truncate max-w-[120px]">{file.name}</span>
                           <button onClick={() => setAttachedFiles(f => f.filter((_, idx) => idx !== i))} className="text-white/60 hover:text-red-400"><X className="w-3 h-3"/></button>
                         </div>
                       ))}
                     </div>
                   )}
                   {cameraActive && (
                     <div className="mx-4 mb-2 mt-2 overflow-hidden rounded-xl border border-white/10 aspect-video relative max-w-[150px]">
                       <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                     </div>
                   )}
                   <div className="flex items-end">
                     <textarea 
                       value={input}
                       onChange={e => setInput(e.target.value)}
                       onKeyDown={e => {
                         if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           sendMessage();
                         }
                       }}
                       placeholder="Message IRIS" 
                       className="w-full bg-transparent text-white placeholder-white/40 focus:outline-none resize-none pt-2.5 pb-2.5 px-4 text-[15px]"
                       rows={1}
                     />
                     <div className="flex items-center pb-1 pr-1 gap-1">
                        <label className="p-2 hover:bg-white/10 rounded-full cursor-pointer transition-colors text-white/70 hover:text-white">
                           <Upload className="w-5 h-5"/>
                           <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                        </label>
                        <button onClick={toggleCamera} className={`p-2 rounded-full transition-colors ${cameraActive ? 'text-blue-400 bg-blue-500/20' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                           <Camera className="w-5 h-5"/>
                        </button>
                        <button 
                          disabled={isProcessing || (!input && attachedFiles.length===0 && !cameraActive)}
                          onClick={() => sendMessage()}
                          className={`p-2 ml-1 rounded-full transition-colors ${input.trim() || attachedFiles.length || cameraActive ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-white/30 cursor-not-allowed'}`}
                        >
                           <Send className="w-5 h-5"/>
                        </button>
                     </div>
                   </div>
                </div>
                <div className="text-center mt-3 text-[11px] text-white/40">IRIS can make mistakes. Check important info.</div>
              </div>

            </div>
          )}
        </div>
        
        {/* Hidden Canvas for camera capture logic */}
        <canvas ref={canvasRef} hidden />
      </div>
    </div>
  );
}
