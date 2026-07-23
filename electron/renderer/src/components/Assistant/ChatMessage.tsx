import { Card, CardContent } from '../ui/card'
import { cn } from '@/lib/utils'
import { AssistantMessage } from '@/stores/assistantStore'

interface ChatMessageProps {
  message: AssistantMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <Card
        className={cn(
          'max-w-[85%] bg-zinc-900/70 border-zinc-800 text-sm',
          isUser ? 'bg-violet-900/60 border-violet-700/50' : ''
        )}
      >
        <CardContent className="p-4">
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {isUser ? 'You' : 'Assistant'}
            </div>
            <p className="whitespace-pre-line text-zinc-200">
              {message.error ? `⚠️ ${message.error}` : message.content || (message.pending ? 'Thinking…' : '')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

