import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Bot,
  User,
  Loader2,
  ArrowUp,
  ChevronDown,
  Hammer,
  FileText,
  HelpCircle,
  X,
  ChevronRight,
  Check,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { assistantStore, useAssistantStore, AssistantMode, AssistantTab, ToolCall } from '@/stores/assistantStore';
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
        gradientToClass: 'to-amber-400/20',
        haloBgClass: 'bg-amber-400/20'
    },
    'agent': { 
        icon: Hammer, 
        color: 'text-emerald-400', 
        lightColor: 'text-emerald-200',
        gradientToClass: 'to-emerald-400/20',
        haloBgClass: 'bg-emerald-400/20'
    },
    'plan': { 
        icon: FileText, 
        color: 'text-purple-400', 
        lightColor: 'text-purple-200',
        gradientToClass: 'to-purple-400/20',
        haloBgClass: 'bg-purple-400/20'
    }
};

export function AssistantSidebar({ activeUrl, selectedText, topOffset = 0 }: AssistantSidebarProps) {
  const { isSending, messages, pageContext, mode, activeTab, conversationId } = useAssistantStore((s) => s);
  const [input, setInput] = useState('');
  const [showModePicker, setShowModePicker] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  
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

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
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

  const handleSendStreaming = useCallback(async (message: string, assistantMessageId: string) => {
    const contextToSend = {
      url: pageContext?.url ?? activeUrl ?? null,
      selectedText: pageContext?.selectedText ?? selectedText ?? null
    };

    // Use streaming API
    const cleanup = window.electronAPI.assistant.sendMessageStream(
      message,
      contextToSend,
      mode,
      conversationId,
      {
        onEvent: (event) => {
          switch (event.type) {
            case 'thinking':
              assistantStore.updateMessage(assistantMessageId, {
                content: event.content || 'Thinking...',
                streaming: true
              });
              break;
            case 'chunk':
              assistantStore.appendChunk(assistantMessageId, event.content || '');
              break;
            case 'tool_start':
              if (event.tool_name) {
                assistantStore.addToolCall(assistantMessageId, {
                  id: `tool-${Date.now()}`,
                  name: event.tool_name,
                  args: event.tool_args || {},
                  status: 'running'
                });
              }
              break;
            case 'tool_end':
              // Find the last tool call with this name and update it
              const state = assistantStore.getState();
              const msg = state.messages.find(m => m.id === assistantMessageId);
              const toolCall = msg?.toolCalls?.find(tc => tc.name === event.tool_name && tc.status === 'running');
              if (toolCall) {
                assistantStore.updateToolCall(assistantMessageId, toolCall.id, {
                  status: 'completed',
                  result: event.tool_result
                });
              }
              break;
            case 'done':
              assistantStore.completeStreaming(assistantMessageId);
              assistantStore.setSending(false);
              cleanupRef.current = null;
              break;
            case 'error':
              assistantStore.updateMessage(assistantMessageId, {
                pending: false,
                streaming: false,
                error: event.content || 'Unknown error'
              });
              assistantStore.setSending(false);
              cleanupRef.current = null;
              break;
          }
        },
        onError: (error) => {
          assistantStore.updateMessage(assistantMessageId, {
            pending: false,
            streaming: false,
            error
          });
          assistantStore.setSending(false);
          cleanupRef.current = null;
        },
        onComplete: () => {
          cleanupRef.current = null;
        }
      }
    );

    cleanupRef.current = cleanup;
  }, [activeUrl, selectedText, pageContext, mode, conversationId]);

  const handleSendNonStreaming = useCallback(async (message: string, assistantMessageId: string) => {
    try {
      const response = await window.electronAPI.assistant.sendMessage(message, {
        url: pageContext?.url ?? activeUrl ?? null,
        selectedText: pageContext?.selectedText ?? selectedText ?? null
      }, mode, conversationId);

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
  }, [activeUrl, selectedText, pageContext, mode, conversationId]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    // Add user message
    const userMessageId = `user-${Date.now()}`;
    assistantStore.addMessage({
      id: userMessageId,
      role: 'user',
      content: trimmed,
      mode
    });

    // Add pending assistant message
    const assistantMessageId = `assistant-${Date.now()}`;
    assistantStore.addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      pending: true,
      streaming: useStreaming,
      mode
    });

    setInput('');
    assistantStore.setSending(true);

    if (useStreaming) {
      await handleSendStreaming(trimmed, assistantMessageId);
    } else {
      await handleSendNonStreaming(trimmed, assistantMessageId);
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

  // Tool call display component
  const ToolCallDisplay = ({ toolCall }: { toolCall: ToolCall }) => {
    const [expanded, setExpanded] = useState(false);
    
    return (
      <div className="mt-2 p-2 bg-white/5 rounded border border-white/10 text-xs">
        <button 
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          <ChevronRight 
            size={12} 
            className={cn("text-white/40 transition-transform", expanded && "rotate-90")} 
          />
          <span className="text-white/60 font-mono">{toolCall.name}</span>
          {toolCall.status === 'running' && (
            <Loader2 size={10} className="animate-spin text-amber-400 ml-auto" />
          )}
          {toolCall.status === 'completed' && (
            <Check size={10} className="text-emerald-400 ml-auto" />
          )}
          {toolCall.status === 'error' && (
            <AlertCircle size={10} className="text-red-400 ml-auto" />
          )}
        </button>
        {expanded && (
          <div className="mt-2 pl-4 border-l border-white/10">
            {Object.keys(toolCall.args).length > 0 && (
              <div className="mb-1">
                <span className="text-white/40">Args: </span>
                <code className="text-white/60">{JSON.stringify(toolCall.args)}</code>
              </div>
            )}
            {toolCall.result && (
              <div>
                <span className="text-white/40">Result: </span>
                <code className="text-white/60">{toolCall.result}</code>
              </div>
            )}
            {toolCall.error && (
              <div className="text-red-400">{toolCall.error}</div>
            )}
          </div>
        )}
      </div>
    );
  };
  
  // Tab styles
  const TabButton = ({ tab, label }: { tab: AssistantTab; label: string }) => (
    <button
      onClick={() => handleTabChange(tab)}
      className={cn(
        'px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
        activeTab === tab 
          ? 'bg-white/10 text-white shadow-sm' 
          : 'text-white/50 hover:text-white/70 hover:bg-white/5'
      )}
    >
      {label}
    </button>
  );

  return (
    <aside
      className="relative flex w-[420px] flex-col border-l border-white/10 bg-gradient-to-b from-[#0a0a0b] via-[#0f0a14] to-[#0a0a0b] overflow-hidden"
      style={{ height: `calc(100vh - ${topOffset}px)` }}
    >
      {/* Ambient Glow Effect */}
      <div className={`absolute inset-0 pointer-events-none bg-gradient-to-br from-transparent via-transparent ${currentModeConfig.gradientToClass} opacity-60 animate-pulse transition-all duration-1000`}></div>
      <div className="absolute inset-x-0 bottom-32 pointer-events-none flex justify-center">
        <div className="w-[95%] max-w-5xl h-72 bg-gradient-radial from-white/10 via-white/5 to-transparent opacity-50 blur-2xl"></div>
      </div>
      <div className="absolute inset-x-0 bottom-20 flex justify-center pointer-events-none">
        <div className={`w-[120%] max-w-6xl h-80 ${currentModeConfig.haloBgClass} opacity-60 blur-[110px] animate-pulse transition-colors duration-1000`}></div>
      </div>
      <div className="absolute inset-x-0 bottom-10 flex justify-center pointer-events-none">
        <div className="w-[70%] max-w-3xl h-40 bg-gradient-radial from-white/10 via-transparent to-transparent opacity-50 blur-xl animate-[pulse_3s_ease-in-out_infinite]"></div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0a0a0b] via-[#0a0a0b]/90 to-transparent opacity-95 pointer-events-none"></div>

      {/* Header (Tabs & Close) */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/10">
         <div className="flex items-center p-1 bg-white/5 rounded-lg border border-white/10">
            <TabButton tab="chat" label="Chat" />
            <TabButton tab="workflows" label="Workflows" />
         </div>
         <div className="flex items-center gap-2">
            {/* Clear chat button */}
            {messages.length > 0 && (
              <button 
                onClick={() => assistantStore.clearMessages()}
                className="p-1.5 text-white/40 hover:text-white/70 hover:bg-white/5 rounded transition-colors"
                title="Clear chat"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button onClick={() => assistantStore.close()} className="p-2 text-white/50 hover:text-white transition-colors">
               <X size={16} />
            </button>
         </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10" ref={listRef}>
         {activeTab === 'chat' ? (
             <>
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-60">
                        <div className={cn("p-4 rounded-full mb-4 bg-white/5 border border-white/10", currentModeConfig.color)}>
                            <CurrentModeIcon size={32} />
                        </div>
                        <h3 className="text-white/90 font-medium mb-2">
                            {mode === 'ask' && 'Ask me anything'}
                            {mode === 'agent' && 'Agent Mode'}
                            {mode === 'plan' && 'Planning Mode'}
                        </h3>
                        <p className="text-xs text-white/50 max-w-[200px]">
                            {mode === 'ask' && 'I can help you browse, analyze pages, and answer questions.'}
                            {mode === 'agent' && 'I can perform actions and automate tasks for you.'}
                            {mode === 'plan' && 'I can help you structure complex workflows and tasks.'}
                        </p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex items-start max-w-[90%] gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`p-2 rounded-full flex-shrink-0 ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-white/10 text-white/70'}`}>
                                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                            </div>
                            <div className={cn(
                                "p-3 rounded-lg overflow-hidden",
                                msg.role === 'user' 
                                    ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100' 
                                    : msg.mode === 'agent'
                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-white/90'
                                    : msg.mode === 'plan'
                                    ? 'bg-purple-500/10 border border-purple-500/20 text-white/90'
                                    : 'bg-white/5 border border-white/10 text-white/90'
                            )}>
                                {/* Mode badge for assistant messages */}
                                {msg.role === 'assistant' && msg.mode && (
                                    <div className="flex items-center gap-1 mb-2">
                                        <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded",
                                            MODE_CONFIG[msg.mode].color,
                                            "bg-white/5"
                                        )}>
                                            {msg.mode}
                                        </span>
                                    </div>
                                )}
                                <div className="prose prose-sm max-w-none prose-invert break-words text-sm whitespace-pre-wrap">
                                    {msg.content || (msg.pending && !msg.streaming ? <span className="animate-pulse">Thinking...</span> : '')}
                                    {/* Streaming cursor */}
                                    {msg.streaming && (
                                        <span className="inline-block w-2 h-4 bg-white/60 ml-0.5 animate-pulse" />
                                    )}
                                    {msg.error && <span className="text-red-400 block mt-1">Error: {msg.error}</span>}
                                </div>
                                {/* Tool calls */}
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        {msg.toolCalls.map((tc) => (
                                            <ToolCallDisplay key={tc.id} toolCall={tc} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
             </>
         ) : (
             <div className="flex items-center justify-center h-full text-white/40 text-sm">
                 Workflows coming soon
             </div>
         )}
      </div>

      {/* Input Area */}
      {activeTab === 'chat' && (
        <div className="border-t border-white/10 bg-[#0a0a0b]/80 backdrop-blur-md rounded-b-lg relative z-20 px-6 py-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 focus-within:ring-1 focus-within:ring-purple-500/50 focus-within:border-purple-500/50 transition-all shadow-sm relative">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Ask in ${mode} mode...`}
                    className="w-full bg-transparent text-white placeholder-white/40 text-sm resize-none !outline-none !ring-0 !border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none max-h-[200px] overflow-y-auto custom-scrollbar px-1 py-1"
                    rows={1}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                />

                <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/10">
                    {/* Left: Mode Picker */}
                    <div className="relative">
                        {showModePicker && (
                            <div className="absolute bottom-full mb-2 left-0 w-32 bg-[#0a0a0b] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                                {Object.keys(MODE_CONFIG).map((m) => {
                                    const mKey = m as AssistantMode;
                                    const config = MODE_CONFIG[mKey];
                                    const Icon = config.icon;
                                    return (
                                        <button
                                            key={mKey}
                                            onClick={() => handleModeChange(mKey)}
                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5 ${mode === mKey ? cn('bg-white/10', config.color) : 'text-white/60'}`}
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
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-xs text-white/70 border border-transparent hover:bg-white/10 transition-all"
                        >
                            <span className={currentModeConfig.color}>
                                <CurrentModeIcon size={14} />
                            </span>
                            <span className="capitalize">{mode}</span>
                            <ChevronDown size={12} className="text-white/40" />
                        </button>
                    </div>

                    {/* Right: Submit / Cancel */}
                    <div className="flex items-center gap-2">
                        {isSending ? (
                            <button 
                                onClick={() => {
                                    if (cleanupRef.current) {
                                        cleanupRef.current();
                                        cleanupRef.current = null;
                                    }
                                    assistantStore.setSending(false);
                                    // Mark any streaming messages as cancelled
                                    const state = assistantStore.getState();
                                    state.messages.forEach(msg => {
                                        if (msg.streaming) {
                                            assistantStore.updateMessage(msg.id, {
                                                streaming: false,
                                                pending: false,
                                                content: msg.content + '\n\n[Cancelled]'
                                            });
                                        }
                                    });
                                }}
                                className="p-1.5 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors"
                                title="Cancel"
                            >
                                <X size={14} />
                            </button>
                        ) : (
                             <button 
                                onClick={handleSend} 
                                disabled={!input.trim()} 
                                className="p-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                <ArrowUp size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <div className="text-center mt-2">
                <p className="text-[10px] text-white/30">AI can make mistakes. Check important info.</p>
            </div>
        </div>
      )}
    </aside>
  );
}
