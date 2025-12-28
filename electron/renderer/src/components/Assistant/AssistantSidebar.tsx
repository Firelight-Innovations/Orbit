import React, { useRef, useEffect, useState } from 'react';
import {
  Bot,
  User,
  Loader2,
  ArrowUp,
  ChevronDown,
  Hammer,
  FileText,
  HelpCircle,
  X
} from 'lucide-react';
import { assistantStore, useAssistantStore, AssistantMode, AssistantTab } from '@/stores/assistantStore';
import { cn } from '@/lib/utils';

interface AssistantSidebarProps {
  activeUrl?: string | null
  selectedText?: string | null
  topOffset?: number
}

const MODE_CONFIG: Record<AssistantMode, {
    icon: React.ElementType;
    color: string;
    lightColor: string;
    gradientToClass: string;
    haloBgClass: string;
}> = {
    'ask': { 
        icon: HelpCircle, 
        color: 'text-amber-400', 
        lightColor: 'text-amber-200',
        gradientToClass: 'to-amber-400/25',
        haloBgClass: 'bg-amber-400/25'
    },
    'agent': { 
        icon: Hammer, 
        color: 'text-emerald-400', 
        lightColor: 'text-emerald-200',
        gradientToClass: 'to-emerald-400/25',
        haloBgClass: 'bg-emerald-400/25'
    },
    'plan': { 
        icon: FileText, 
        color: 'text-purple-400', 
        lightColor: 'text-purple-200',
        gradientToClass: 'to-purple-400/25',
        haloBgClass: 'bg-purple-400/25'
    }
};

export function AssistantSidebar({ activeUrl, selectedText, topOffset = 0 }: AssistantSidebarProps) {
  const { isSending, messages, pageContext, mode, activeTab } = useAssistantStore((s) => s);
  const [input, setInput] = useState('');
  const [showModePicker, setShowModePicker] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync context
  useEffect(() => {
    assistantStore.setPageContext({ url: activeUrl ?? null, selectedText: selectedText ?? null });
  }, [activeUrl, selectedText]);

  // Handle Escape
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        assistantStore.close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    // Add user message
    const userMessageId = `user-${Date.now()}`;
    assistantStore.addMessage({
      id: userMessageId,
      role: 'user',
      content: trimmed
    });

    // Add pending assistant message
    const assistantMessageId = `assistant-${Date.now()}`;
    assistantStore.addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      pending: true
    });

    setInput('');
    assistantStore.setSending(true);

    try {
        const response = await window.electronAPI.assistant.sendMessage(trimmed, {
            url: pageContext?.url ?? activeUrl ?? null,
            selectedText: pageContext?.selectedText ?? selectedText ?? null
        });

        if (response?.error) {
            assistantStore.updateMessage(assistantMessageId, {
                pending: false,
                error: response.error,
                content: ''
            });
        } else {
            assistantStore.updateMessage(assistantMessageId, {
                pending: false,
                content: response?.response ?? ''
            });
        }
    } catch (err) {
        assistantStore.updateMessage(assistantMessageId, {
            pending: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            content: ''
        });
    } finally {
        assistantStore.setSending(false);
    }
  };

  const handleModeChange = (newMode: AssistantMode) => {
    assistantStore.setMode(newMode);
    setShowModePicker(false);
  };

  const handleTabChange = (newTab: AssistantTab) => {
    assistantStore.setActiveTab(newTab);
  };

  const currentModeConfig = MODE_CONFIG[mode];
  const CurrentModeIcon = currentModeConfig.icon;
  
  // Tab styles
  const getTabClass = (tab: AssistantTab) => cn(
    'relative px-4 py-2 text-sm font-medium transition-colors',
    activeTab === tab ? cn('text-white', currentModeConfig.color) : 'text-zinc-500 hover:text-zinc-300'
  );

  return (
    <aside
      className="relative flex w-[420px] flex-col border-l border-zinc-800 bg-gray-900 overflow-hidden"
      style={{ height: `calc(100vh - ${topOffset}px)` }}
    >
      {/* Ambient Glow Effect - Exact copy from ChatInterface */}
      <div className={`absolute inset-0 pointer-events-none bg-gradient-to-br from-transparent via-transparent ${currentModeConfig.gradientToClass} opacity-80 animate-pulse transition-all duration-1000`}></div>
      <div className="absolute inset-x-0 bottom-32 pointer-events-none flex justify-center">
        <div className="w-[95%] max-w-5xl h-72 bg-gradient-radial from-white/60 via-white/25 to-transparent opacity-90 blur-2xl"></div>
      </div>
      <div className="absolute inset-x-0 bottom-20 flex justify-center pointer-events-none">
        <div className={`w-[120%] max-w-6xl h-80 ${currentModeConfig.haloBgClass} opacity-90 blur-[110px] animate-pulse transition-colors duration-1000`}></div>
      </div>
      <div className="absolute inset-x-0 bottom-10 flex justify-center pointer-events-none">
        <div className="w-[70%] max-w-3xl h-40 bg-gradient-radial from-white/40 via-transparent to-transparent opacity-80 blur-xl animate-[pulse_3s_ease-in-out_infinite]"></div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-gray-950 via-gray-900/90 to-transparent opacity-95 pointer-events-none"></div>

      {/* Header (Tabs & Close) */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
         <div className="flex items-center gap-6">
            <button onClick={() => handleTabChange('chat')} className={getTabClass('chat')}>
                Chat
                {activeTab === 'chat' && (
                    <div className={cn('absolute bottom-0 left-0 right-0 h-0.5', currentModeConfig.color.replace('text-', 'bg-'))} />
                )}
            </button>
            <button onClick={() => handleTabChange('workflows')} className={getTabClass('workflows')}>
                Workflows
                {activeTab === 'workflows' && (
                    <div className={cn('absolute bottom-0 left-0 right-0 h-0.5', currentModeConfig.color.replace('text-', 'bg-'))} />
                )}
            </button>
            <button onClick={() => handleTabChange('agents')} className={getTabClass('agents')}>
                Agents
                {activeTab === 'agents' && (
                    <div className={cn('absolute bottom-0 left-0 right-0 h-0.5', currentModeConfig.color.replace('text-', 'bg-'))} />
                )}
            </button>
         </div>
         <button onClick={() => assistantStore.close()} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <X size={16} />
         </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10" ref={listRef}>
         {activeTab === 'chat' ? (
             <>
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-60">
                        <div className={cn("p-4 rounded-full mb-4 bg-gray-800/50 border", currentModeConfig.color.replace('text-', 'border-').replace('400', '500/30'))}>
                            <CurrentModeIcon size={32} className={currentModeConfig.color} />
                        </div>
                        <h3 className="text-zinc-300 font-medium mb-2">
                            {mode === 'ask' && 'Ask me anything'}
                            {mode === 'agent' && 'Agent Mode'}
                            {mode === 'plan' && 'Planning Mode'}
                        </h3>
                        <p className="text-xs text-zinc-500 max-w-[200px]">
                            {mode === 'ask' && 'I can help you browse, analyze pages, and answer questions.'}
                            {mode === 'agent' && 'I can perform actions and automate tasks for you.'}
                            {mode === 'plan' && 'I can help you structure complex workflows and tasks.'}
                        </p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex items-start max-w-[90%] gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`p-2 rounded-full flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'}`}>
                                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                            </div>
                            <div className={`p-3 rounded-lg ${msg.role === 'user' 
                                ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100' 
                                : 'bg-gray-800 border border-gray-700 text-gray-200'} overflow-hidden`}>
                                <div className="prose prose-sm max-w-none prose-invert break-words text-sm whitespace-pre-wrap">
                                    {msg.content || (msg.pending ? <span className="animate-pulse">Thinking...</span> : '')}
                                    {msg.error && <span className="text-red-400 block mt-1">Error: {msg.error}</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
             </>
         ) : (
             <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                 {activeTab === 'workflows' ? 'Workflows coming soon' : 'Agents coming soon'}
             </div>
         )}
      </div>

      {/* Input Area */}
      {activeTab === 'chat' && (
        <div className="border-t border-gray-800 bg-gray-900 rounded-b-lg relative z-20 px-6 py-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 focus-within:ring-1 focus-within:ring-blue-500/50 focus-within:border-blue-500/50 transition-all shadow-sm relative">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Ask in ${mode} mode...`}
                    className="w-full bg-transparent text-gray-200 placeholder-gray-500 text-sm resize-none focus:outline-none max-h-[200px] overflow-y-auto custom-scrollbar px-1 py-1"
                    rows={1}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                />

                <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-700/50">
                    {/* Left: Mode Picker */}
                    <div className="relative">
                        {showModePicker && (
                            <div className="absolute bottom-full mb-2 left-0 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
                                {Object.keys(MODE_CONFIG).map((m) => {
                                    const mKey = m as AssistantMode;
                                    const config = MODE_CONFIG[mKey];
                                    const Icon = config.icon;
                                    return (
                                        <button
                                            key={mKey}
                                            onClick={() => handleModeChange(mKey)}
                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-700 ${mode === mKey ? cn('bg-gray-700/50', config.color) : 'text-gray-300'}`}
                                        >
                                            <Icon size={12} />
                                            <span className="capitalize">{mKey}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <button 
                            onClick={() => setShowModePicker(!showModePicker)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800 text-xs text-gray-300 border border-transparent hover:border-gray-600 transition-all"
                        >
                            <span className={currentModeConfig.color}>
                                <CurrentModeIcon size={14} />
                            </span>
                            <span className="capitalize">{mode}</span>
                            <ChevronDown size={12} className="text-gray-500" />
                        </button>
                    </div>

                    {/* Right: Submit */}
                    <div className="flex items-center gap-2">
                        {isSending ? (
                            <button 
                                className="p-1.5 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 transition-colors shadow-sm cursor-not-allowed"
                                disabled
                            >
                                <Loader2 size={14} className="animate-spin" />
                            </button>
                        ) : (
                             <button 
                                onClick={handleSend} 
                                disabled={!input.trim()} 
                                className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                <ArrowUp size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <div className="text-center mt-2">
                <p className="text-[10px] text-gray-600">AI can make mistakes. Check important info.</p>
            </div>
        </div>
      )}
    </aside>
  );
}
